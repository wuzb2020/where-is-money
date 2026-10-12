package com.qianqunale.accounting.floating

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.GradientDrawable.Orientation
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.qianqunale.accounting.MainActivity
import com.qianqunale.accounting.R
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Android 系统级悬浮球前台服务。
 *
 * 职责：
 *  1) 在前台服务中常驻 MediaProjection + 常驻 VirtualDisplay/ImageReader，
 *     服务存活期间只需授权一次，点击悬浮球即可直接取最新帧（无需重复弹授权框）。
 *  2) 悬浮球支持拖动与右侧贴边吸附。
 *  3) 点击悬浮球：临时隐藏球体 → 延迟 350ms 取帧（避免把球截进屏幕）→
 *     保存截图 → 恢复球体 → 携带截图路径唤起 MainActivity。
 *  4) 自动删除 7 天前的旧截图，避免长期占用本地存储。
 *
 * 启动顺序（Android 14 硬性要求）：
 *    必须先 startForeground() 且声明 foregroundServiceType=mediaProjection，
 *    之后才能调用 MediaProjectionManager.getMediaProjection()，
 *    否则抛出 SecurityException。
 */
class FloatingBubbleService : Service() {

  companion object {
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    const val EXTRA_SCREENSHOT_PATH = "screenshotPath"
    private const val CHANNEL_ID = "floating_bubble"
    private const val NOTIFICATION_ID = 9401
    private const val CAPTURE_DELAY_MS = 350L
    private const val KEEP_SCREENSHOT_DAYS = 7L
    private const val BUBBLE_SIZE_DP = 58

    @Volatile
    var isRunning = false
      private set
  }

  private lateinit var windowManager: WindowManager
  private var bubbleView: View? = null

  // 拖动状态
  private var downRawX = 0f
  private var downRawY = 0f
  private var initX = 0f
  private var initY = 0f
  private var isDragged = false

  // MediaProjection
  private var mediaProjection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var screenWidth = 0
  private var screenHeight = 0
  private var screenDensity = 0

  private val mainHandler = Handler(Looper.getMainLooper())
  private val captureExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  private val screenshotDir: File by lazy {
    File(filesDir, "floating_screenshots").apply { mkdirs() }
  }

  private var isCapturing = false

  // ---------------------------------------------------------------- 生命周期

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    readScreenSize()
    startBusyNotification()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, -1) ?: -1
    val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
    if (resultCode != -1 && resultData != null) {
      startMediaProjection(resultCode, resultData)
    }
    showBubble()
    isRunning = true
    cleanUpOldScreenshots()
    return START_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    removeBubble()
    stopProjection()
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) {
    }
    captureExecutor.shutdown()
    super.onDestroy()
  }

  // ---------------------------------------------------------------- 前台通知

  private fun createChannel() {
    val mgr = getSystemService(NotificationManager::class.java)
    if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
      val ch = NotificationChannel(
        CHANNEL_ID,
        "记账悬浮球",
        NotificationManager.IMPORTANCE_LOW,
      )
      mgr.createNotificationChannel(ch)
    }
  }

  private fun startBusyNotification() {
    createChannel()
    startForeground(NOTIFICATION_ID, buildNotification())
  }

  private fun buildNotification(): Notification {
    val launch = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("记账悬浮球运行中")
      .setContentText("点击悬浮球识别当前屏幕上的账单")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setContentIntent(launch)
      .build()
  }

  // ---------------------------------------------------------------- 屏幕参数

  private fun readScreenSize() {
    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION")
    windowManager.defaultDisplay.getRealMetrics(metrics)
    screenWidth = metrics.widthPixels
    screenHeight = metrics.heightPixels
    screenDensity = metrics.densityDpi
  }

  // ---------------------------------------------------------------- MediaProjection

  @Suppress("DEPRECATION")
  private fun startMediaProjection(resultCode: Int, resultData: Intent) {
    try {
      val mgr = getSystemService(MediaProjectionManager::class.java)
      mediaProjection = mgr.getMediaProjection(resultCode, resultData)
      startVirtualDisplay()
    } catch (e: Exception) {
      // 授权 token 丢失或创建失败：悬浮球仍显示，但截图会失败并触发错误通知
      e.printStackTrace()
    }
  }

  private fun startVirtualDisplay() {
    val mp = mediaProjection ?: return
    val reader = ImageReader.newInstance(
      screenWidth,
      screenHeight,
      PixelFormat.RGBA_8888,
      2,
    )
    imageReader = reader
    val vd = mp.createVirtualDisplay(
      "AccountingFloatingCapture",
      screenWidth,
      screenHeight,
      screenDensity,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      reader.surface,
      null,
      null,
    )
    virtualDisplay = vd
  }

  private fun stopProjection() {
    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null
    imageReader?.close()
    imageReader = null
    try {
      mediaProjection?.stop()
    } catch (_: Exception) {
    }
    mediaProjection = null
  }

  // ---------------------------------------------------------------- 悬浮球 UI

  private fun showBubble() {
    if (bubbleView != null) return
    val view = createBubbleView()
    bubbleView = view
    val sizePx = dp(BUBBLE_SIZE_DP)
    val params = WindowManager.LayoutParams(
      sizePx,
      sizePx,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = screenWidth - sizePx - dp(12)
    params.y = screenHeight / 3
    try {
      windowManager.addView(view, params)
    } catch (_: Exception) {
    }
  }

  private fun createBubbleView(): View {
    val tv = TextView(this).apply {
      text = "账"
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      textSize = 22f
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.colors = intArrayOf(
        Color.parseColor("#FF7043"),
        Color.parseColor("#E53935"),
      )
      bg.orientation = Orientation.TL_BR
      background = bg
    }
    tv.setOnTouchListener { v, event -> onBubbleTouch(v, event) }
    tv.setOnClickListener { performCapture() }
    return tv
  }

  private fun onBubbleTouch(view: View, event: MotionEvent): Boolean {
    val lm = windowManager
    val params = view.layoutParams as WindowManager.LayoutParams
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downRawX = event.rawX
        downRawY = event.rawY
        initX = params.x.toFloat()
        initY = params.y.toFloat()
        isDragged = false
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!isDragged && (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4))) {
          isDragged = true
        }
        if (isDragged) {
          params.x = (initX + dx).toInt().coerceIn(0, screenWidth - view.width)
          params.y = (initY + dy).toInt().coerceIn(0, screenHeight - view.height)
          try {
            lm.updateViewLayout(view, params)
          } catch (_: Exception) {
          }
        }
        return true
      }

      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        // 松手后贴边吸附到右侧
        if (isDragged) {
          snapToEdge(view)
        }
        return true
      }
    }
    return false
  }

  private fun snapToEdge(view: View) {
    val params = view.layoutParams as WindowManager.LayoutParams
    val leftDist = params.x
    val rightDist = screenWidth - (params.x + view.width)
    val targetX = if (leftDist <= rightDist) 0 else screenWidth - view.width
    params.x = targetX
    try {
      windowManager.updateViewLayout(view, params)
    } catch (_: Exception) {
    }
  }

  private fun removeBubble() {
    bubbleView?.let {
      try {
        windowManager.removeView(it)
      } catch (_: Exception) {
      }
    }
    bubbleView = null
  }

  // ---------------------------------------------------------------- 截图流程

  /**
   * 点击悬浮球：先隐藏球体（避免被截进屏幕帧），延迟后再取帧。
   */
  private fun performCapture() {
    if (isCapturing) return
    isCapturing = true

    val view = bubbleView
    view?.visibility = View.GONE

    mainHandler.postDelayed({
      captureAndNotify()
    }, CAPTURE_DELAY_MS)
  }

  private fun captureAndNotify() {
    captureExecutor.execute {
      var file: File? = null
      try {
        file = captureFrame()
      } catch (e: Exception) {
        e.printStackTrace()
      } finally {
        mainHandler.post {
          bubbleView?.visibility = View.VISIBLE
          isCapturing = false
        }
      }

      val saved = file
      if (saved != null) {
        mainHandler.post { launchMainWithScreenshot(saved.absolutePath) }
      }
    }
  }

  /** 在后台线程取一帧并保存为 JPEG，返回文件；失败返回 null。 */
  private fun captureFrame(): File? {
    val reader = imageReader ?: return null
    var image: Image? = null
    var attempts = 0
    while (image == null && attempts < 4) {
      image = reader.acquireLatestImage()
      if (image == null) {
        Thread.sleep(100)
        attempts++
      }
    }
    if (image == null) return null

    return try {
      val width = screenWidth
      val height = screenHeight
      val plane = image.planes[0]
      val buffer = plane.buffer
      val pixelStride = plane.pixelStride
      val rowStride = plane.rowStride
      val rowPadding = rowStride - pixelStride * width
      val paddedWidth = width + rowPadding / pixelStride
      val bitmap = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
      bitmap.copyPixelsFromBuffer(buffer)
      val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
      val ts = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())
      val file = File(screenshotDir, "cap_$ts.jpg")
      FileOutputStream(file).use { out ->
        if (!cropped.compress(Bitmap.CompressFormat.JPEG, 90, out)) {
          return null
        }
      }
      cropped.recycle()
      bitmap.recycle()
      file
    } finally {
      image?.close()
    }
  }

  /** 携带截图路径唤起记账 App 主界面。 */
  private fun launchMainWithScreenshot(path: String) {
    val intent = Intent(this, MainActivity::class.java).apply {
      putExtra(EXTRA_SCREENSHOT_PATH, path)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    try {
      startActivity(intent)
    } catch (e: Exception) {
      // 启动失败（极端情况）：路径仍可通过 Module 缓存消费
      FloatingBubbleModule.rememberPendingScreenshot(path)
    }
  }

  // ---------------------------------------------------------------- 工具

  private fun cleanUpOldScreenshots() {
    try {
      val cutoff = System.currentTimeMillis() - KEEP_SCREENSHOT_DAYS * 24 * 60 * 60 * 1000L
      screenshotDir.listFiles()?.forEach { file ->
        if (file.lastModified() < cutoff) {
          file.delete()
        }
      }
    } catch (_: Exception) {
    }
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density + 0.5f).toInt()
}