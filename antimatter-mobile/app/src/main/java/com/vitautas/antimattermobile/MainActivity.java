package com.vitautas.antimattermobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int CREATE_DOCUMENT_REQUEST = 1002;
    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
    private static final String GAME_URL = "https://" + APP_ASSET_HOST + "/assets/game/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingDownloadBytes;
    private String pendingDownloadMime;
    private String pendingDownloadName;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        enterImmersiveMode();

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF111014);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " AntimatterMobile/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.addJavascriptInterface(new DownloadBridge(), "AndroidDownloads");
        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_ASSET_HOST.equalsIgnoreCase(uri.getHost())) {
                    return false;
                }
                String scheme = uri.getScheme();
                if (scheme == null || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException error) {
                    Toast.makeText(MainActivity.this, "No app can open this link.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                    "document.documentElement.classList.add('android-mobile-shell');" +
                    "document.addEventListener('contextmenu',e=>e.preventDefault(),{passive:false});",
                    null
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> newFilePathCallback,
                FileChooserParams fileChooserParams
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = newFilePathCallback;
                Intent intent;
                try {
                    intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
            String resolvedMime = mimeType == null || mimeType.isBlank()
                ? guessMimeType(filename)
                : mimeType;

            if (url.startsWith("blob:")) {
                saveBlobFromWebView(url, filename, resolvedMime);
            } else if (url.startsWith("data:")) {
                saveDataUrl(url, filename, resolvedMime);
            } else {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException error) {
                    Toast.makeText(this, "Unable to download this file.", Toast.LENGTH_SHORT).show();
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(GAME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void saveBlobFromWebView(String url, String filename, String mimeType) {
        String script = "(async()=>{try{" +
            "const response=await fetch(" + JSONObject.quote(url) + ");" +
            "const blob=await response.blob();" +
            "const reader=new FileReader();" +
            "reader.onloadend=()=>{" +
            "const value=String(reader.result);" +
            "AndroidDownloads.saveBase64(" + JSONObject.quote(filename) + "," +
            JSONObject.quote(mimeType) + ",value.substring(value.indexOf(',')+1));" +
            "};reader.readAsDataURL(blob);" +
            "}catch(error){console.error('Export failed',error);}})();";
        webView.evaluateJavascript(script, null);
    }

    private void saveDataUrl(String url, String filename, String fallbackMime) {
        try {
            int comma = url.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("Malformed data URL");
            String metadata = url.substring(5, comma);
            String payload = url.substring(comma + 1);
            boolean isBase64 = metadata.contains(";base64");
            String mime = metadata.split(";", 2)[0];
            if (mime.isBlank()) mime = fallbackMime;
            byte[] bytes = isBase64
                ? Base64.decode(payload, Base64.DEFAULT)
                : URLDecoder.decode(payload, StandardCharsets.UTF_8.name()).getBytes(StandardCharsets.UTF_8);
            requestDocumentSave(filename, mime, bytes);
        } catch (Exception error) {
            Toast.makeText(this, "Export could not be prepared.", Toast.LENGTH_SHORT).show();
        }
    }

    private String guessMimeType(String filename) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(filename);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return mime == null ? "application/octet-stream" : mime;
    }

    private void requestDocumentSave(String filename, String mimeType, byte[] bytes) {
        runOnUiThread(() -> {
            pendingDownloadBytes = bytes;
            pendingDownloadMime = mimeType == null || mimeType.isBlank()
                ? "application/octet-stream"
                : mimeType;
            pendingDownloadName = filename == null || filename.isBlank()
                ? "antimatter-dimensions-save.txt"
                : filename.replaceAll("[\\\\/:*?\"<>|]", "_");

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(pendingDownloadMime)
                .putExtra(Intent.EXTRA_TITLE, pendingDownloadName);
            try {
                startActivityForResult(intent, CREATE_DOCUMENT_REQUEST);
            } catch (ActivityNotFoundException error) {
                clearPendingDownload();
                Toast.makeText(this, "No document provider is available.", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void writePendingDownload(Uri destination) {
        if (pendingDownloadBytes == null || destination == null) return;
        try (OutputStream output = getContentResolver().openOutputStream(destination)) {
            if (output == null) throw new IOException("No output stream");
            output.write(pendingDownloadBytes);
            output.flush();
            Toast.makeText(this, "Export saved.", Toast.LENGTH_SHORT).show();
        } catch (IOException error) {
            Toast.makeText(this, "Export could not be saved.", Toast.LENGTH_SHORT).show();
        } finally {
            clearPendingDownload();
        }
    }

    private void clearPendingDownload() {
        pendingDownloadBytes = null;
        pendingDownloadMime = null;
        pendingDownloadName = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] result = resultCode == RESULT_OK
                    ? WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                    : null;
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }

        if (requestCode == CREATE_DOCUMENT_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                writePendingDownload(data.getData());
            } else {
                clearPendingDownload();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
        enterImmersiveMode();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        webView.removeJavascriptInterface("AndroidDownloads");
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    private final class DownloadBridge {
        @JavascriptInterface
        public void saveBase64(String filename, String mimeType, String base64Data) {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                requestDocumentSave(filename, mimeType, bytes);
            } catch (IllegalArgumentException error) {
                runOnUiThread(() -> Toast.makeText(
                    MainActivity.this,
                    "Export data was invalid.",
                    Toast.LENGTH_SHORT
                ).show());
            }
        }
    }
}
