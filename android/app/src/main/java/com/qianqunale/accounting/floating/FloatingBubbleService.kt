package com.qianqunale.accounting.floating

import android.app.Activity
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
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.GradientDrawable.Orientation
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
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
 *  2) 悬浮球支持拖动、边缘吸附与边缘半隐藏（类似 1688 悬浮球）。
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
    private const val BUBBLE_SIZE_DP = 40

    /** 贴边后隐藏比例：0.6 表示 60% 藏在屏幕边缘后 */
    private const val EDGE_HIDE_RATIO = 0.6f

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
  private var edgeIsRight = true  // 当前吸附在哪一侧

  // MediaProjection
  private var mediaProjection: MediaProjection? = null
  /** 当前活跃 projection 对应的 callback，供 stopProjection 时 unregister。 */
  private var activeCallback: MediaProjection.Callback? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var screenWidth = 0
  private var screenHeight = 0
  private var screenDensity = 0

  private val mainHandler = Handler(Looper.getMainLooper())
  private val captureExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  /**
   * 为每个 MediaProjection 实例创建独立的 Callback（Android 14 要求必须先注册回调
   * 才能 createVirtualDisplay，否则抛 IllegalStateException）。
   *
   * 为什么不能用单例 callback：
   *  关闭→快速再开启时，旧 mp 的 onStop 可能在新 projection 就绪后才异步触发；
   *  若 callback 无差别地调用 releaseProjectionResources()，会把新 projection 的
   *  VirtualDisplay/ImageReader 释放掉，导致「再开启必报初始化失败」。
   *
   * 修复：callback 持有对应 mp 的引用，onStop 时只有当该 mp 仍是当前活跃的
   * mediaProjection 才释放资源；否则忽略（说明已被新 projection 替换）。
   */
  private fun createProjectionCallback(owner: MediaProjection) = object : MediaProjection.Callback() {
    override fun onStop() {
      val isCurrent = mediaProjection === owner
      android.util.Log.w(
        "FloatingBubble",
        "MediaProjection onStop: isCurrent=$isCurrent (owner=$owner, current=$mediaProjection)",
      )
      if (isCurrent) {
        releaseProjectionResources()
        val msg = "屏幕共享已停止，请重新开启悬浮球"
        toast(msg)
        FloatingBubbleModule.notifyErrorStatic(msg)
      } else {
        android.util.Log.d("FloatingBubble", "onStop from stale projection, resources kept")
      }
    }
  }

  private val screenshotDir: File by lazy {
    File(filesDir, "floating_screenshots").apply { mkdirs() }
  }

  private var isCapturing = false

  /** 仅当 VirtualDisplay 真正创建成功才为 true，作为取帧前的唯一可靠前置依据。 */
  private var projectionReady = false

  // ---------------------------------------------------------------- 生命周期

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    readScreenSize()
    startBusyNotification()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // 【关键】Activity.RESULT_OK 的真实值就是 -1，不能用 -1 当「没有 token」的哨兵值，
    // 否则用户点了「允许」（RESULT_OK = -1）反而被判成无 token，服务直接放弃初始化，
    // 表现为「开启悬浮球就报初始化失败」。这里改用 RESULT_CANCELED(0) 作默认值，
    // 并用 hasExtra 判断 intent 是否真的带了授权结果，彻底避开 -1 撞车陷阱。
    val hasResultCode = intent?.hasExtra(EXTRA_RESULT_CODE) == true
    val hasResultData = intent?.hasExtra(EXTRA_RESULT_DATA) == true
    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
      ?: Activity.RESULT_CANCELED
    val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
    // Honor/华为 MagicOS 会屏蔽 Log.d/Log.i，诊断日志统一走 Log.w 才能被 logcat 看到
    android.util.Log.w(
      "FloatingBubble",
      "onStartCommand: resultCode=$resultCode(RESULT_OK=-1), hasCode=$hasResultCode, " +
        "hasData=$hasResultData, existingMp=${mediaProjection != null}, startId=$startId",
    )
    // 【关键】「关闭→快速再开启」时 Android 不保证旧实例已 onDestroy，
    // 可能由同一实例再次收到 start（旧 mediaProjection 仍存活）。
    // 必须先彻底释放旧投影，否则新会话创建 VirtualDisplay 会失败，
    // 表现为「再开启报初始化失败」。这里做无条件的幂等清理。
    if (mediaProjection != null) {
      android.util.Log.w("FloatingBubble", "onStartCommand: tearing down stale projection before re-init")
      stopProjection()
    }
    if (resultCode == Activity.RESULT_OK && resultData != null) {
      startMediaProjection(resultCode, resultData)
    }
    android.util.Log.w(
      "FloatingBubble",
      "onStartCommand: after init projectionReady=$projectionReady, vd=${virtualDisplay != null}, reader=${imageReader != null}",
    )
    // 投影链路没就绪的原因有三：
    //  ① 进程被杀后系统重启服务，拿不到授权 token（MediaProjection token 无法跨进程复用）；
    //  ② resultData 被复用（Android 14 token 一次性），getMediaProjection 返回 null；
    //  ③ 拿到 token 但 VirtualDisplay 建不出来（如 Android 14 未注册回调）。
    // 三种情况都截不了图 —— 不显示球、明确告知用户并停服，杜绝「点了没反应」。
    if (!projectionReady) {
      val reason = when {
        !hasResultCode -> "未收到授权结果码（服务被系统重启，token 无法跨进程复用）"
        resultCode != Activity.RESULT_OK -> "屏幕录制授权被拒绝(resultCode=$resultCode)"
        resultData == null -> "授权数据缺失"
        else -> "VirtualDisplay 创建失败（见上方 startVirtualDisplay 日志）"
      }
      val msg = "悬浮球截图初始化失败：$reason。请在设置中关闭后重新开启"
      android.util.Log.e("FloatingBubble", "onStartCommand: projection not ready, reason=$reason, stop self")
      toast(msg)
      FloatingBubbleModule.notifyErrorStatic(msg)
      stopSelf()
      return START_NOT_STICKY
    }
    showBubble()
    isRunning = true
    cleanUpOldScreenshots()
    // 不用 START_STICKY：投影 token 无法在重启后恢复，重启只会得到一颗失效的球
    return START_NOT_STICKY
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
      val mp = mgr.getMediaProjection(resultCode, resultData)
        ?: throw IllegalStateException("getMediaProjection returned null")
      mediaProjection = mp
      // 【关键】必须先注册回调，再创建 VirtualDisplay。
      // Android 14+ 未注册回调时 createVirtualDisplay() 抛 IllegalStateException。
      // 每个 mp 用独立 callback，避免旧 onStop 异步触发时误释放新资源。
      val cb = createProjectionCallback(mp)
      activeCallback = cb
      mp.registerCallback(cb, mainHandler)
      android.util.Log.w("FloatingBubble", "MediaProjection obtained, callback registered")
      startVirtualDisplay()
    } catch (e: Exception) {
      // 授权 token 丢失 / 创建失败：释放半成品资源；是否停服与提示由 onStartCommand 统一处理
      android.util.Log.e("FloatingBubble", "startMediaProjection failed: ${e.message}", e)
      releaseProjectionResources()
    }
  }

  /** 创建 VirtualDisplay 并维护 projectionReady 状态；创建失败时回收 ImageReader，保持状态一致。 */
  private fun startVirtualDisplay(): Boolean {
    val mp = mediaProjection ?: return false
    if (screenWidth <= 0 || screenHeight <= 0) {
      android.util.Log.e("FloatingBubble", "startVirtualDisplay: bad screen size ${screenWidth}x$screenHeight")
      return false
    }
    val reader = ImageReader.newInstance(
      screenWidth,
      screenHeight,
      PixelFormat.RGBA_8888,
      2,
    )
    imageReader = reader
    return try {
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
      projectionReady = vd != null
      android.util.Log.w("FloatingBubble", "VirtualDisplay created, projectionReady=$projectionReady")
      projectionReady
    } catch (e: Exception) {
      android.util.Log.e("FloatingBubble", "createVirtualDisplay failed: ${e.message}", e)
      try {
        reader.close()
      } catch (_: Exception) {
      }
      imageReader = null
      projectionReady = false
      false
    }
  }

  /** 只释放投影的输出资源（VirtualDisplay / ImageReader），不动 MediaProjection 本身。 */
  private fun releaseProjectionResources() {
    projectionReady = false
    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null
    try {
      imageReader?.close()
    } catch (_: Exception) {
    }
    imageReader = null
  }

  private fun stopProjection() {
    releaseProjectionResources()
    val mp = mediaProjection
    val cb = activeCallback
    mediaProjection = null
    activeCallback = null
    if (mp != null) {
      // 先 unregisterCallback 再 stop，避免 onStop 被触发后又去释放已清理的资源
      if (cb != null) {
        try {
          mp.unregisterCallback(cb)
        } catch (_: Exception) {
        }
      }
      try {
        mp.stop()
      } catch (_: Exception) {
      }
    }
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
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    // 初始位置：贴右边半隐藏
    val hiddenOffset = (sizePx * EDGE_HIDE_RATIO).toInt()
    params.x = screenWidth - sizePx + hiddenOffset
    params.y = screenHeight / 3
    edgeIsRight = true
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
      textSize = 16f
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.colors = intArrayOf(
        Color.parseColor("#FF7043"),
        Color.parseColor("#E53935"),
      )
      bg.orientation = Orientation.TL_BR
      background = bg
      // 设置最小触摸区域，即使只有 40% 露出也能点到
      minWidth = dp(BUBBLE_SIZE_DP)
      minHeight = dp(BUBBLE_SIZE_DP)
      isClickable = true
    }
    tv.setOnTouchListener { v, event -> onBubbleTouch(v, event) }
    // 贴边半隐藏后，可见部分只有十几 dp，正好落在系统「返回手势」的屏幕边缘热区里，
    // 点击容易被系统手势抢走 → 声明手势排除区域，保证边缘点击能落到球上（API 29+）。
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tv.systemGestureExclusionRects = listOf(Rect(0, 0, dp(BUBBLE_SIZE_DP), dp(BUBBLE_SIZE_DP)))
    }
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
        return true  // 必须 return true 才能让 Android 继续把 MOVE/UP 事件发给本 listener
      }

      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!isDragged && (Math.abs(dx) > dp(8) || Math.abs(dy) > dp(8))) {
          isDragged = true
          // 开始拖动时先把球完全拉出来，方便用户看位置
          val fullSize = dp(BUBBLE_SIZE_DP)
          params.x = (initX + dx).toInt().coerceIn(0, screenWidth - fullSize)
          try { lm.updateViewLayout(view, params) } catch (_: Exception) {}
        }
        if (isDragged) {
          params.x = (initX + dx).toInt().coerceIn(0, screenWidth - view.width)
          params.y = (initY + dy).toInt().coerceIn(dp(24), screenHeight - view.height - dp(80))
          try {
            lm.updateViewLayout(view, params)
          } catch (_: Exception) {
          }
        }
        return true
      }

      MotionEvent.ACTION_UP -> {
        if (isDragged) {
          // 拖动结束 → 贴边半隐藏
          snapToEdge(view)
        } else {
          // 点击（未拖动）→ 先完全露出球体，再执行截图
          revealBubble(view)
          performCapture()
        }
        return true
      }

      MotionEvent.ACTION_CANCEL -> {
        if (isDragged) snapToEdge(view)
        return true
      }
    }
    return false
  }

  /** 把球完全拉出来（从贴边半隐藏状态） */
  private fun revealBubble(view: View) {
    val params = view.layoutParams as WindowManager.LayoutParams
    val size = view.width
    if (edgeIsRight) {
      params.x = screenWidth - size
    } else {
      params.x = 0
    }
    try { windowManager.updateViewLayout(view, params) } catch (_: Exception) {}
  }

  /** 松手后贴到最近边缘，并半隐藏 EDGE_HIDE_RATIO 比例 */
  private fun snapToEdge(view: View) {
    val params = view.layoutParams as WindowManager.LayoutParams
    val size = view.width
    val hiddenOffset = (size * EDGE_HIDE_RATIO).toInt()
    val leftDist = params.x
    val rightDist = screenWidth - (params.x + size)
    edgeIsRight = rightDist <= leftDist
    params.x = if (edgeIsRight) {
      screenWidth - size + hiddenOffset  // 右边：露出左侧 40%
    } else {
      -hiddenOffset                       // 左边：露出右侧 40%
    }
    // Y 轴边界保护
    params.y = params.y.coerceIn(dp(24), screenHeight - size - dp(80))
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
    android.util.Log.d("FloatingBubble", "performCapture called, isCapturing=true")

    // 前置检查：投影链路必须真正就绪（仅 mediaProjection != null 不够 ——
    // Android 14 未注册回调时 VirtualDisplay 建不出来，projectionReady 才是可靠依据）
    if (!projectionReady || imageReader == null || virtualDisplay == null || mediaProjection == null) {
      android.util.Log.e(
        "FloatingBubble",
        "performCapture: projection not ready (ready=$projectionReady mp=${mediaProjection != null} vd=${virtualDisplay != null} reader=${imageReader != null})",
      )
      val msg = "悬浮球截图暂不可用，请关闭后重新开启悬浮球"
      mainHandler.post {
        bubbleView?.visibility = View.VISIBLE
        bubbleView?.let { snapToEdge(it) }
        isCapturing = false
        // 用户此刻正在别的 App 里，必须用系统 Toast 才能让失败可见
        toast(msg)
      }
      FloatingBubbleModule.notifyErrorStatic(msg)
      return
    }

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
        android.util.Log.e("FloatingBubble", "captureFrame exception: ${e.message}", e)
      } finally {
        mainHandler.post {
          bubbleView?.visibility = View.VISIBLE
          bubbleView?.let { snapToEdge(it) }
          isCapturing = false
        }
      }

      val saved = file
      if (saved != null) {
        android.util.Log.d("FloatingBubble", "capture success, path=${saved.absolutePath}")
        mainHandler.post { launchMainWithScreenshot(saved.absolutePath) }
      } else {
        android.util.Log.e("FloatingBubble", "captureFrame returned null")
      }
    }
  }

  /** 在后台线程取一帧并保存为 JPEG，返回文件；失败返回 null。 */
  private fun captureFrame(): File? {
    val reader = imageReader ?: run {
      android.util.Log.e("FloatingBubble", "captureFrame: imageReader is null")
      return null
    }
    var image: Image? = null
    var attempts = 0
    while (image == null && attempts < 4) {
      image = reader.acquireLatestImage()
      if (image == null) {
        Thread.sleep(100)
        attempts++
      }
    }
    if (image == null) {
      android.util.Log.e("FloatingBubble", "captureFrame: still null after $attempts attempts")
      return null
    }

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

  /** 携带截图路径通知 JS + 唤起记账 App 主界面。 */
  private fun launchMainWithScreenshot(path: String) {
    // 归一化为 file:// URI：RN 的 <Image>、expo-file-system、expo-image-manipulator
    // 都只认带 scheme 的 URI，裸绝对路径会被静默拒绝（预览黑屏 / 指纹失败）。
    val uri = if (path.startsWith("/")) "file://$path" else path
    // 1. 最可靠：直接通过 Module 静态方法发 DeviceEventEmitter 事件给 JS
    FloatingBubbleModule.notifyScreenshotStatic(uri)
    // 2. 同时唤起 App 到前台（让用户能看到弹窗）
    val intent = Intent(this, MainActivity::class.java).apply {
      putExtra(EXTRA_SCREENSHOT_PATH, uri)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    try {
      startActivity(intent)
    } catch (e: Exception) {
      // 启动失败（极端情况）：路径已在 notifyScreenshotStatic 里缓存
    }
  }

  // ---------------------------------------------------------------- 工具

  /** 系统级 Toast：前台服务允许弹出，用于「用户不在本 App 内」时也能看到失败原因。 */
  private fun toast(msg: String) {
    mainHandler.post {
      try {
        Toast.makeText(applicationContext, msg, Toast.LENGTH_LONG).show()
      } catch (_: Exception) {
      }
    }
  }

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
