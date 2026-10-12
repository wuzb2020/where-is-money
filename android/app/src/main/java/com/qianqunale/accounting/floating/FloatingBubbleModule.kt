package com.qianqunale.accounting.floating

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat

import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.qianqunale.accounting.floating.FloatingBubbleService.Companion.EXTRA_SCREENSHOT_PATH

/**
 * RN 原生桥接层：向 JS 暴露悬浮球控制 API，并承载事件发射与冷启动路径缓存。
 *
 * 事件通道：
 *  - EVENT_SCREENSHOT：悬浮球点击成功截图，携 uri 实时通知 JS（RN 存活时）。
 *  - EVENT_ERROR / EVENT_STOPPED：服务异常 / 停止。
 *  JS 也可随时通过 consumePendingScreenshot() 主动拉取待消费路径（App 冷启动兜底）。
 *
 * 冷启动双保险：
 *  - Service: 点击悬浮球唤起 MainActivity → onCreate/onNewIntent 走 onMainActivityIntent
 *  - Service: startActivity 失败时直接调 rememberPendingScreenshot 落缓存
 *  JS 启动后最终都能通过 consumePendingScreenshot() 拿到路径，不会丢失。
 */
class FloatingBubbleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    const val NAME = "FloatingBubble"
    const val EVENT_SCREENSHOT = "FloatingBubbleScreenshot"
    const val EVENT_ERROR = "FloatingBubbleError"
    const val EVENT_STOPPED = "FloatingBubbleStopped"
    private const val REQ_MEDIA_PROJECTION = 9401

    /** 待消费的截图路径缓存（静态，App 被杀后 JS 重启也能取到）。 */
    @Volatile
    var pendingScreenshotPath: String? = null
      private set

    /** MainActivity 在 onCreate/onNewIntent 时转发 Intent，把截图路径落缓存。 */
    @JvmStatic
    fun onMainActivityIntent(intent: Intent?) {
      rememberPendingScreenshot(intent?.getStringExtra(EXTRA_SCREENSHOT_PATH))
    }

    /** Service 在无法唤起 Activity 时直接落缓存。 */
    @JvmStatic
    fun rememberPendingScreenshot(path: String?) {
      if (!path.isNullOrEmpty()) pendingScreenshotPath = path
    }
  }

  private var projectionPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = NAME

  // ---------------------------------------------------------------- 事件发射

  private fun sendEvent(name: String, params: WritableMap?) {
    try {
      if (!reactContext.hasActiveReactInstance()) return
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, params)
    } catch (_: Exception) {
    }
  }

  private fun notifyScreenshot(path: String) {
    pendingScreenshotPath = path
    sendEvent(EVENT_SCREENSHOT, Arguments.createMap().apply {
      putString("uri", path)
    })
  }

  // ---------------------------------------------------------------- JS API

  /** 是否已授予悬浮窗权限。 */
  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactContext))
  }

  /** 跳转系统悬浮窗授权设置页。 */
  @ReactMethod
  fun openOverlayPermissionSettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactContext.packageName}"),
      )
      currentActivity?.let { activity ->
        activity.startActivity(intent)
      } ?: run {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_SETTINGS_FAILED", e.message)
    }
  }

  /** Android 13+ 通知权限。 */
  @ReactMethod
  fun hasNotificationPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < 33) {
      promise.resolve(true)
      return
    }
    val granted = ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  /**
   * 启动悬浮球：要求已授权悬浮窗。
   * 内部发起 MediaProjection 系统授权，结果回流后自动启动前台服务。
   */
  @ReactMethod
  fun startBubble(promise: Promise) {
    if (!Settings.canDrawOverlays(reactContext)) {
      promise.reject("NO_OVERLAY_PERMISSION", "缺少“显示在其他应用上层”权限")
      return
    }
    if (FloatingBubbleService.isRunning) {
      promise.resolve(true)
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "主界面未运行，无法发起授权")
      return
    }
    projectionPromise = promise
    val mgr = activity.getSystemService(MediaProjectionManager::class.java)
    activity.startActivityForResult(
      mgr.createScreenCaptureIntent(),
      REQ_MEDIA_PROJECTION,
    )
  }

  @ReactMethod
  fun stopBubble(promise: Promise) {
    try {
      reactContext.stopService(
        Intent(reactContext, FloatingBubbleService::class.java),
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_FAILED", e.message)
    }
  }

  @ReactMethod
  fun isBubbleRunning(promise: Promise) {
    promise.resolve(FloatingBubbleService.isRunning)
  }

  /** JS 主动拉取待消费截图路径并清空缓存。 */
  @ReactMethod
  fun consumePendingScreenshot(promise: Promise) {
    val path = pendingScreenshotPath
    pendingScreenshotPath = null
    promise.resolve(path)
  }

  // RN 事件订阅兼容（JS 侧用 DeviceEventEmitter 直连，此处占位）。
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  // ---------------------------------------------------------------- ActivityEventListener

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_MEDIA_PROJECTION) return
    val promise = projectionPromise
    projectionPromise = null
    if (resultCode == Activity.RESULT_OK && data != null) {
      val service = Intent(reactContext, FloatingBubbleService::class.java).apply {
        putExtra(FloatingBubbleService.EXTRA_RESULT_CODE, resultCode)
        putExtra(FloatingBubbleService.EXTRA_RESULT_DATA, data)
      }
      // 前台服务：Service 收到后先 startForeground 再 getMediaProjection（Android 14 顺序）
      ContextCompat.startForegroundService(reactContext, service)
      promise?.resolve(true)
    } else {
      promise?.resolve(false)
    }
  }

  override fun onNewIntent(intent: Intent?) {
    // 悬浮球唤起 MainActivity 时（热复用 onCreate 走静态、onNewIntent 走实例）
    val path = intent?.getStringExtra(EXTRA_SCREENSHOT_PATH)
    if (!path.isNullOrEmpty()) {
      notifyScreenshot(path)
    }
  }

  override fun invalidate() {
    super.invalidate()
    projectionPromise = null
  }
}