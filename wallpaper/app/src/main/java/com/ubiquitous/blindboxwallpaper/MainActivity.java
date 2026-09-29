package com.ubiquitous.blindboxwallpaper;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        applyBasePadding(root, null);
        root.setBackgroundColor(Color.rgb(5, 8, 22));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            applyBasePadding(root, insets);
            return insets;
        });

        TextView title = new TextView(this);
        title.setText(R.string.activity_title);
        title.setTextColor(Color.rgb(225, 246, 255));
        title.setTextSize(25f);
        title.setGravity(Gravity.CENTER);

        TextView body = new TextView(this);
        body.setText(R.string.activity_body);
        body.setTextColor(Color.rgb(150, 190, 215));
        body.setTextSize(16f);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(16), 0, dp(24));

        Button setWallpaper = new Button(this);
        setWallpaper.setText(R.string.set_wallpaper);
        setWallpaper.setMinHeight(dp(56));
        setWallpaper.setOnClickListener(v -> openWallpaperPicker());

        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(setWallpaper, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
        root.requestApplyInsets();
    }

    private void applyBasePadding(LinearLayout root, WindowInsets insets) {
        int left = dp(24);
        int top = dp(48);
        int right = dp(24);
        int bottom = dp(24);
        if (insets != null) {
            left += insets.getSystemWindowInsetLeft();
            top += insets.getSystemWindowInsetTop();
            right += insets.getSystemWindowInsetRight();
            bottom += insets.getSystemWindowInsetBottom();
        }
        root.setPadding(left, top, right, bottom);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void openWallpaperPicker() {
        ComponentName component = new ComponentName(this, WallpaperEngineService.class);
        Intent direct = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
        direct.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, component);
        try {
            startActivity(direct);
        } catch (Exception ignored) {
            startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
        }
    }
}
