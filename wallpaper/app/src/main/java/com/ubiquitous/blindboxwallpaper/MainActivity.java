package com.ubiquitous.blindboxwallpaper;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
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
        root.setPadding(48, 96, 48, 48);
        root.setBackgroundColor(Color.rgb(5, 8, 22));

        TextView title = new TextView(this);
        title.setText("BlindBoxAI // LIVE DATA PULSE");
        title.setTextColor(Color.rgb(225, 246, 255));
        title.setTextSize(25f);
        title.setGravity(Gravity.CENTER);

        TextView body = new TextView(this);
        body.setText("Animated aggregate production metrics. Refreshes every 15 minutes while visible. No Supabase secret is stored in this app.");
        body.setTextColor(Color.rgb(150, 190, 215));
        body.setTextSize(16f);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 32, 0, 48);

        Button setWallpaper = new Button(this);
        setWallpaper.setText("SET LIVE WALLPAPER");
        setWallpaper.setMinHeight(120);
        setWallpaper.setOnClickListener(v -> openWallpaperPicker());

        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(setWallpaper, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
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
