package com.ubiquitous.blindboxwallpaper;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class WallpaperEngineService extends WallpaperService {
    private static final String ENDPOINT = "https://blindboxai.com/api/wallpaper/metrics";
    private static final String PREFS = "blindbox_wallpaper";
    private static final String CACHE_KEY = "last_snapshot";
    private static final long REFRESH_MS = 15L * 60L * 1000L;

    @Override
    public Engine onCreateEngine() {
        return new DataPulseEngine();
    }

    private final class DataPulseEngine extends Engine {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final ExecutorService network = Executors.newSingleThreadExecutor();
        private final AtomicBoolean fetchInFlight = new AtomicBoolean(false);
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final List<Star> stars = new ArrayList<>();
        private volatile Snapshot snapshot = Snapshot.empty();
        private volatile boolean visible = false;
        private final long startedAtMs = System.currentTimeMillis();
        private long lastFetchMs = 0L;
        private int width = 1;
        private int height = 1;

        private final Runnable drawFrame = new Runnable() {
            @Override
            public void run() {
                if (!visible) return;
                draw();
                handler.postDelayed(this, frameDelayMs());
            }
        };

        private final Runnable refresh = new Runnable() {
            @Override
            public void run() {
                if (!visible) return;
                fetchMetrics();
                handler.postDelayed(this, REFRESH_MS);
            }
        };

        DataPulseEngine() {
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            String cached = getSharedPreferences(PREFS, MODE_PRIVATE).getString(CACHE_KEY, null);
            if (cached != null) snapshot = Snapshot.fromJson(cached);
        }

        @Override
        public void onVisibilityChanged(boolean isVisible) {
            visible = isVisible;
            handler.removeCallbacks(drawFrame);
            handler.removeCallbacks(refresh);
            if (visible) {
                if (System.currentTimeMillis() - lastFetchMs > 60_000L) fetchMetrics();
                handler.post(drawFrame);
                handler.postDelayed(refresh, REFRESH_MS);
            }
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int w, int h) {
            super.onSurfaceChanged(holder, format, w, h);
            width = Math.max(1, w);
            height = Math.max(1, h);
            rebuildStars();
            if (visible) draw();
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            visible = false;
            handler.removeCallbacksAndMessages(null);
            super.onSurfaceDestroyed(holder);
        }

        @Override
        public void onDestroy() {
            network.shutdownNow();
            super.onDestroy();
        }

        private long frameDelayMs() {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            return pm != null && pm.isPowerSaveMode() ? 66L : 33L;
        }

        private void rebuildStars() {
            stars.clear();
            long state = 0x9E3779B97F4A7C15L ^ ((long) width << 32) ^ height;
            int count = Math.max(60, Math.min(150, width * height / 9000));
            for (int i = 0; i < count; i++) {
                state = state * 6364136223846793005L + 1442695040888963407L;
                float x = ((state >>> 16) & 0xffff) / 65535f * width;
                state = state * 6364136223846793005L + 1442695040888963407L;
                float y = ((state >>> 16) & 0xffff) / 65535f * height;
                state = state * 6364136223846793005L + 1442695040888963407L;
                float r = 0.7f + (((state >>> 16) & 0xff) / 255f) * 2.2f;
                stars.add(new Star(x, y, r, i * 0.73f));
            }
        }

        private void fetchMetrics() {
            if (!visible || !fetchInFlight.compareAndSet(false, true)) return;
            lastFetchMs = System.currentTimeMillis();
            network.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(8_000);
                    connection.setReadTimeout(8_000);
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setRequestProperty("User-Agent", "BlindBoxAI-Live-Wallpaper/1.0");
                    int code = connection.getResponseCode();
                    if (code < 200 || code >= 300) return;
                    StringBuilder body = new StringBuilder();
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) body.append(line);
                    }
                    Snapshot next = Snapshot.fromJson(body.toString());
                    if (next.generatedAtMs > 0) {
                        snapshot = next;
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(CACHE_KEY, body.toString()).apply();
                    }
                } catch (Exception ignored) {
                    // Keep the last verified snapshot. Never substitute fake data.
                } finally {
                    if (connection != null) connection.disconnect();
                    fetchInFlight.set(false);
                }
            });
        }

        private void draw() {
            Canvas canvas = null;
            try {
                canvas = getSurfaceHolder().lockCanvas();
                if (canvas == null) return;
                render(canvas, (System.currentTimeMillis() - startedAtMs) / 1000f);
            } finally {
                if (canvas != null) getSurfaceHolder().unlockCanvasAndPost(canvas);
            }
        }

        private void render(Canvas c, float t) {
            float w = c.getWidth();
            float h = c.getHeight();
            drawBackground(c, w, h, t);
            drawHeader(c, w, h, t);

            float margin = w * 0.045f;
            float gap = w * 0.025f;
            float cardW = (w - margin * 2 - gap) / 2f;
            float cardH = h * 0.115f;
            float y1 = h * 0.15f;
            float y2 = y1 + cardH + h * 0.016f;
            float y3 = y2 + cardH + h * 0.016f;

            drawMetricCard(c, margin, y1, cardW, cardH, "QUALIFIED CLICKS", snapshot.qualifiedClicks, 0xff00e5ff, snapshot.clickSeries, t, 0f);
            drawMetricCard(c, margin + cardW + gap, y1, cardW, cardH, "VIDEOS LIVE", snapshot.publishedVideos, 0xffff49d8, snapshot.videoSeries, t, 1.2f);
            drawMetricCard(c, margin, y2, cardW, cardH, "QUESTIONS", snapshot.questions, 0xffb072ff, snapshot.questionSeries, t, 2.4f);
            drawMetricCard(c, margin + cardW + gap, y2, cardW, cardH, "ANALYTICS", snapshot.analyticsEvents, 0xff4d8bff, snapshot.analyticsSeries, t, 3.6f);
            drawMetricCard(c, margin, y3, cardW, cardH, "PRICE OBS.", snapshot.priceObservations, 0xffffc247, null, t, 4.8f);
            drawMetricCard(c, margin + cardW + gap, y3, cardW, cardH, "CONFIRMED SALES", snapshot.confirmedConversions, snapshot.confirmedConversions > 0 ? 0xff52ffb8 : 0xffff526f, null, t, 6f);

            float coreY = h * 0.62f;
            drawDataStreams(c, w, h, coreY, t);
            drawHologramCore(c, w / 2f, coreY, Math.min(w, h) * 0.115f, t);
            drawSparklinePanel(c, margin, h * 0.735f, w - margin * 2, h * 0.125f, snapshot.clickSeries);
            drawFooter(c, w, h, t);
        }

        private void drawBackground(Canvas c, float w, float h, float t) {
            paint.setStyle(Paint.Style.FILL);
            paint.setShader(new LinearGradient(0, 0, 0, h,
                    new int[]{0xff030615, 0xff07112b, 0xff050816, 0xff01030a},
                    new float[]{0f, 0.33f, 0.7f, 1f}, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, paint);
            paint.setShader(null);

            float pulse = 0.6f + 0.4f * (float) Math.sin(t * 0.8f);
            paint.setShader(new RadialGradient(w * 0.5f, h * 0.6f, w * 0.75f,
                    new int[]{withAlpha(0xff6f35ff, (int) (36 + 18 * pulse)), 0x00101040}, null, Shader.TileMode.CLAMP));
            c.drawCircle(w * 0.5f, h * 0.6f, w * 0.75f, paint);
            paint.setShader(null);

            for (Star star : stars) {
                float twinkle = 0.35f + 0.65f * Math.abs((float) Math.sin(t * 0.7f + star.phase));
                paint.setColor(withAlpha(0xffd9f6ff, (int) (55 + 145 * twinkle)));
                c.drawCircle(star.x, star.y, star.r * (0.7f + 0.45f * twinkle), paint);
            }

            stroke.setStrokeWidth(1.2f);
            stroke.setColor(0x3324a8ff);
            float horizon = h * 0.64f;
            for (int i = -7; i <= 7; i++) {
                float bottomX = w * 0.5f + i * w * 0.15f;
                c.drawLine(w * 0.5f, horizon, bottomX, h, stroke);
            }
            for (int i = 0; i < 9; i++) {
                float p = i / 8f;
                float y = horizon + (h - horizon) * p * p;
                c.drawLine(0, y, w, y, stroke);
            }
        }

        private void drawHeader(Canvas c, float w, float h, float t) {
            paint.setShader(new LinearGradient(w * 0.18f, 0, w * 0.82f, 0,
                    new int[]{0xff65f7ff, 0xffff5ad8, 0xff916dff}, null, Shader.TileMode.CLAMP));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(android.graphics.Typeface.create("sans-serif-black", android.graphics.Typeface.BOLD));
            paint.setTextSize(w * 0.087f);
            c.drawText("BlindBoxAI", w / 2f, h * 0.073f, paint);
            paint.setShader(null);

            paint.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD));
            paint.setTextSize(w * 0.029f);
            paint.setColor(0xffa7dbef);
            c.drawText("LIVE DATA PULSE  •  AGGREGATE PRODUCTION SIGNALS", w / 2f, h * 0.103f, paint);

            float dotPulse = 0.55f + 0.45f * Math.abs((float) Math.sin(t * 2.4f));
            paint.setColor(withAlpha(0xff4dffb1, (int) (130 + 125 * dotPulse)));
            c.drawCircle(w * 0.16f, h * 0.126f, w * 0.008f, paint);
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(w * 0.028f);
            paint.setColor(0xff6effc0);
            c.drawText("LIVE", w * 0.18f, h * 0.134f, paint);
            paint.setTextAlign(Paint.Align.RIGHT);
            paint.setColor(0xff89a9c7);
            c.drawText(snapshot.ageLabel(), w * 0.84f, h * 0.134f, paint);
            paint.setTextAlign(Paint.Align.LEFT);
        }

        private void drawMetricCard(Canvas c, float x, float y, float cw, float ch, String label, long value, int accent, int[] series, float t, float phase) {
            float pulse = 0.5f + 0.5f * Math.abs((float) Math.sin(t * 0.9f + phase));
            RectF r = new RectF(x, y, x + cw, y + ch);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(0xcc07142c);
            c.drawRoundRect(r, cw * 0.07f, cw * 0.07f, paint);

            stroke.setStrokeWidth(2.5f + 1.6f * pulse);
            stroke.setColor(withAlpha(accent, (int) (130 + 85 * pulse)));
            c.drawRoundRect(r, cw * 0.07f, cw * 0.07f, stroke);

            paint.setTextAlign(Paint.Align.LEFT);
            paint.setColor(0xffb9cfe4);
            paint.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD));
            paint.setTextSize(cw * 0.09f);
            c.drawText(label, x + cw * 0.07f, y + ch * 0.25f, paint);

            paint.setTypeface(android.graphics.Typeface.create("sans-serif-black", android.graphics.Typeface.BOLD));
            paint.setTextSize(cw * 0.24f);
            paint.setColor(Color.WHITE);
            c.drawText(formatNumber(value), x + cw * 0.07f, y + ch * 0.67f, paint);

            if (series != null) {
                drawMiniBars(c, x + cw * 0.58f, y + ch * 0.40f, cw * 0.35f, ch * 0.42f, series, accent, t + phase);
            } else {
                float ringR = Math.min(cw, ch) * 0.18f;
                float cx = x + cw * 0.82f;
                float cy = y + ch * 0.61f;
                stroke.setStrokeWidth(2f);
                stroke.setColor(withAlpha(accent, 90));
                c.drawCircle(cx, cy, ringR * (1.05f + 0.08f * pulse), stroke);
                stroke.setColor(withAlpha(accent, 200));
                c.drawArc(new RectF(cx-ringR, cy-ringR, cx+ringR, cy+ringR), -90f, 170f + 110f * pulse, false, stroke);
            }
        }

        private void drawMiniBars(Canvas c, float x, float y, float w, float h, int[] values, int accent, float t) {
            int max = 1;
            for (int v : values) max = Math.max(max, v);
            int start = Math.max(0, values.length - 12);
            int n = Math.max(1, values.length - start);
            float bw = w / n * 0.55f;
            float step = w / n;
            for (int i = start; i < values.length; i++) {
                float ratio = values[i] / (float) max;
                float bh = Math.max(2f, h * ratio);
                float xx = x + (i - start) * step;
                float shimmer = 0.75f + 0.25f * Math.abs((float) Math.sin(t * 1.8f + i));
                paint.setColor(withAlpha(accent, (int) (120 + 100 * shimmer)));
                c.drawRoundRect(new RectF(xx, y + h - bh, xx + bw, y + h), bw * 0.35f, bw * 0.35f, paint);
            }
        }

        private void drawDataStreams(Canvas c, float w, float h, float coreY, float t) {
            int[] colors = {0xff00e5ff, 0xffff49d8, 0xff916dff, 0xffffc247};
            for (int i = 0; i < colors.length; i++) {
                float startX = (i % 2 == 0) ? w * 0.12f : w * 0.88f;
                float startY = h * (0.48f + (i / 2) * 0.055f);
                float endX = w * 0.5f;
                path.reset();
                path.moveTo(startX, startY);
                path.cubicTo(w * (i % 2 == 0 ? 0.30f : 0.70f), startY + h * 0.04f,
                        w * (i % 2 == 0 ? 0.38f : 0.62f), coreY - h * 0.03f,
                        endX, coreY);
                stroke.setStrokeWidth(w * 0.005f);
                stroke.setColor(withAlpha(colors[i], 90));
                c.drawPath(path, stroke);
                stroke.setStrokeWidth(w * 0.002f);
                stroke.setColor(withAlpha(colors[i], 230));
                c.drawPath(path, stroke);

                float p = (t * 0.18f + i * 0.23f) % 1f;
                float px = cubic(startX, w * (i % 2 == 0 ? 0.30f : 0.70f), w * (i % 2 == 0 ? 0.38f : 0.62f), endX, p);
                float py = cubic(startY, startY + h * 0.04f, coreY - h * 0.03f, coreY, p);
                paint.setColor(colors[i]);
                c.drawCircle(px, py, w * 0.008f, paint);
            }
        }

        private float cubic(float a, float b, float c, float d, float t) {
            float u = 1f - t;
            return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
        }

        private void drawHologramCore(Canvas c, float cx, float cy, float radius, float t) {
            float pulse = 0.5f + 0.5f * (float) Math.sin(t * 1.7f);
            paint.setShader(new RadialGradient(cx, cy, radius * 1.8f,
                    new int[]{withAlpha(0xff65f7ff, 120), withAlpha(0xffa446ff, 55), 0x00102040}, null, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, radius * 1.8f, paint);
            paint.setShader(null);

            for (int i = 0; i < 3; i++) {
                float rr = radius * (1.05f + i * 0.28f + 0.04f * pulse);
                stroke.setStrokeWidth(2.2f);
                stroke.setColor(withAlpha(i == 1 ? 0xffff49d8 : 0xff00e5ff, 125 - i * 22));
                c.drawOval(new RectF(cx - rr, cy - rr * 0.35f, cx + rr, cy + rr * 0.35f), stroke);
            }

            float cube = radius * 0.85f;
            float spin = t * 0.7f;
            float dx = (float) Math.cos(spin) * cube * 0.26f;
            float dy = (float) Math.sin(spin) * cube * 0.14f;
            float left = cx - cube * 0.55f;
            float right = cx + cube * 0.55f;
            float top = cy - cube * 0.55f;
            float bottom = cy + cube * 0.55f;
            stroke.setStrokeWidth(4f);
            stroke.setColor(0xff79efff);
            c.drawRect(left, top, right, bottom, stroke);
            stroke.setColor(0xffff5ad8);
            c.drawRect(left + dx, top + dy, right + dx, bottom + dy, stroke);
            stroke.setColor(0xffa98aff);
            c.drawLine(left, top, left + dx, top + dy, stroke);
            c.drawLine(right, top, right + dx, top + dy, stroke);
            c.drawLine(left, bottom, left + dx, bottom + dy, stroke);
            c.drawLine(right, bottom, right + dx, bottom + dy, stroke);

            for (int i = 0; i < 7; i++) {
                double a = t * (0.55 + i * 0.035) + i * 0.9;
                float rr = radius * (1.25f + (i % 3) * 0.18f);
                float px = cx + (float) Math.cos(a) * rr;
                float py = cy + (float) Math.sin(a) * rr * 0.42f;
                paint.setColor(i % 2 == 0 ? 0xff00e5ff : 0xffff49d8);
                c.drawCircle(px, py, radius * 0.045f, paint);
            }
        }

        private void drawSparklinePanel(Canvas c, float x, float y, float w, float h, int[] series) {
            RectF panel = new RectF(x, y, x + w, y + h);
            paint.setColor(0xcc06132c);
            c.drawRoundRect(panel, w * 0.025f, w * 0.025f, paint);
            stroke.setStrokeWidth(2.5f);
            stroke.setColor(0x9949ddff);
            c.drawRoundRect(panel, w * 0.025f, w * 0.025f, stroke);

            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD));
            paint.setTextSize(w * 0.035f);
            paint.setColor(0xffbfe8ff);
            c.drawText("QUALIFIED CLICK PULSE // LAST 24H", x + w * 0.045f, y + h * 0.23f, paint);

            if (series == null || series.length == 0) return;
            int max = 1;
            for (int v : series) max = Math.max(max, v);
            float left = x + w * 0.05f;
            float right = x + w * 0.95f;
            float top = y + h * 0.39f;
            float bottom = y + h * 0.84f;
            path.reset();
            for (int i = 0; i < series.length; i++) {
                float px = left + (right - left) * i / Math.max(1f, series.length - 1f);
                float py = bottom - (bottom - top) * series[i] / max;
                if (i == 0) path.moveTo(px, py); else path.lineTo(px, py);
            }
            stroke.setStrokeWidth(7f);
            stroke.setColor(0x3300e5ff);
            c.drawPath(path, stroke);
            stroke.setStrokeWidth(3f);
            stroke.setColor(0xff31e9ff);
            c.drawPath(path, stroke);

            int latest = series[series.length - 1];
            paint.setTextAlign(Paint.Align.RIGHT);
            paint.setTextSize(w * 0.030f);
            paint.setColor(0xff68ffbe);
            c.drawText("latest hour  " + latest, right, y + h * 0.23f, paint);
            paint.setTextAlign(Paint.Align.LEFT);
        }

        private void drawFooter(Canvas c, float w, float h, float t) {
            float y = h * 0.89f;
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD));
            paint.setTextSize(w * 0.031f);
            paint.setColor(0xff9bc5df);
            String line = String.format(Locale.US, "RAW %s   •   REVIEW %s   •   WAITLIST %s",
                    formatNumber(snapshot.rawClicks), formatNumber(snapshot.reviewQueue), formatNumber(snapshot.waitlistSignups));
            c.drawText(line, w / 2f, y, paint);

            paint.setTextSize(w * 0.035f);
            if (snapshot.confirmedConversions > 0) {
                paint.setColor(0xff65ffb9);
                c.drawText(String.format(Locale.US, "VERIFIED REVENUE  $%,.2f", snapshot.confirmedRevenueUsd), w / 2f, y + h * 0.035f, paint);
            } else {
                float blink = 0.55f + 0.45f * Math.abs((float) Math.sin(t * 1.6f));
                paint.setColor(withAlpha(0xffff5b76, (int) (145 + 105 * blink)));
                c.drawText("NO PROVIDER-CONFIRMED CONVERSIONS RECORDED", w / 2f, y + h * 0.035f, paint);
            }
            paint.setTextSize(w * 0.024f);
            paint.setColor(0xff6f8eab);
            c.drawText("Refreshes every 15 min while visible • aggregate-only endpoint", w / 2f, y + h * 0.065f, paint);
            paint.setTextAlign(Paint.Align.LEFT);
        }

        private String formatNumber(long n) {
            return String.format(Locale.US, "%,d", Math.max(0, n));
        }

        private int withAlpha(int color, int alpha) {
            return Color.argb(Math.max(0, Math.min(255, alpha)), Color.red(color), Color.green(color), Color.blue(color));
        }
    }

    private static final class Star {
        final float x, y, r, phase;
        Star(float x, float y, float r, float phase) {
            this.x = x;
            this.y = y;
            this.r = r;
            this.phase = phase;
        }
    }

    private static final class Snapshot {
        final long generatedAtMs;
        final long rawClicks;
        final long qualifiedClicks;
        final long analyticsEvents;
        final long questions;
        final long publishedVideos;
        final long reviewQueue;
        final long priceObservations;
        final long waitlistSignups;
        final long confirmedConversions;
        final double confirmedRevenueUsd;
        final int[] clickSeries;
        final int[] analyticsSeries;
        final int[] questionSeries;
        final int[] videoSeries;

        Snapshot(long generatedAtMs, long rawClicks, long qualifiedClicks, long analyticsEvents, long questions,
                 long publishedVideos, long reviewQueue, long priceObservations, long waitlistSignups,
                 long confirmedConversions, double confirmedRevenueUsd,
                 int[] clickSeries, int[] analyticsSeries, int[] questionSeries, int[] videoSeries) {
            this.generatedAtMs = generatedAtMs;
            this.rawClicks = rawClicks;
            this.qualifiedClicks = qualifiedClicks;
            this.analyticsEvents = analyticsEvents;
            this.questions = questions;
            this.publishedVideos = publishedVideos;
            this.reviewQueue = reviewQueue;
            this.priceObservations = priceObservations;
            this.waitlistSignups = waitlistSignups;
            this.confirmedConversions = confirmedConversions;
            this.confirmedRevenueUsd = confirmedRevenueUsd;
            this.clickSeries = clickSeries;
            this.analyticsSeries = analyticsSeries;
            this.questionSeries = questionSeries;
            this.videoSeries = videoSeries;
        }

        static Snapshot empty() {
            return new Snapshot(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0d,
                    new int[24], new int[24], new int[24], new int[24]);
        }

        static Snapshot fromJson(String json) {
            try {
                JSONObject root = new JSONObject(json);
                JSONObject totals = root.optJSONObject("totals");
                JSONObject last24h = root.optJSONObject("last24h");
                long generated = 0;
                String generatedAt = root.optString("generatedAt", "");
                if (!generatedAt.isEmpty()) generated = Instant.parse(generatedAt).toEpochMilli();
                if (totals == null) return empty();
                return new Snapshot(
                        generated,
                        totals.optLong("rawClicks", 0),
                        totals.optLong("qualifiedClicks", 0),
                        totals.optLong("analyticsEvents", 0),
                        totals.optLong("questions", 0),
                        totals.optLong("publishedVideos", 0),
                        totals.optLong("reviewQueue", 0),
                        totals.optLong("priceObservations", 0),
                        totals.optLong("waitlistSignups", 0),
                        totals.optLong("confirmedConversions", 0),
                        Math.max(0d, totals.optDouble("confirmedRevenueUsd", 0d)),
                        series(last24h, "qualifiedClicks"),
                        series(last24h, "analyticsEvents"),
                        series(last24h, "questions"),
                        series(last24h, "publishedVideos")
                );
            } catch (Exception ignored) {
                return empty();
            }
        }

        private static int[] series(JSONObject parent, String key) {
            int[] out = new int[24];
            if (parent == null) return out;
            JSONArray rows = parent.optJSONArray(key);
            if (rows == null) return out;
            int start = Math.max(0, rows.length() - 24);
            int offset = 24 - (rows.length() - start);
            for (int i = start; i < rows.length() && offset < 24; i++, offset++) {
                JSONObject row = rows.optJSONObject(i);
                out[offset] = row == null ? 0 : Math.max(0, row.optInt("count", 0));
            }
            return out;
        }

        String ageLabel() {
            if (generatedAtMs <= 0) return "WAITING FOR LIVE DATA";
            long ageMin = Math.max(0, (System.currentTimeMillis() - generatedAtMs) / 60_000L);
            if (ageMin < 1) return "UPDATED JUST NOW";
            if (ageMin < 60) return "UPDATED " + ageMin + "m AGO";
            DateTimeFormatter f = DateTimeFormatter.ofPattern("h:mm a", Locale.US).withZone(ZoneId.systemDefault());
            return "SNAPSHOT " + f.format(Instant.ofEpochMilli(generatedAtMs));
        }
    }
}
