"use client";

import * as LightweightCharts from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface ChartData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface TradingChartProps {
    data: ChartData[];
}

export default function TradingChart({ data }: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<LightweightCharts.IChartApi | null>(null);
    const seriesRef = useRef<LightweightCharts.ISeriesApi<"Candlestick"> | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const isDark = theme === "dark" || theme === "system"; // Simplified check

        // Chart Layout Options
        const chartOptions = {
            layout: {
                background: { type: LightweightCharts.ColorType.Solid, color: isDark ? "#121212" : "#ffffff" },
                textColor: isDark ? "#d1d5db" : "#374151",
            },
            grid: {
                vertLines: { color: isDark ? "#333" : "#e5e7eb" },
                horzLines: { color: isDark ? "#333" : "#e5e7eb" },
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            autoSize: true, // IMPORTANT: Enables auto resize
        };

        const chart = LightweightCharts.createChart(chartContainerRef.current, chartOptions);
        chartRef.current = chart;

        // Create Candlestick Series
        const series = chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderVisible: false,
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
        });
        seriesRef.current = series;

        // Set Data
        series.setData(data);

        // Fit Content
        chart.timeScale().fitContent();

        // Resize Observer to handle window resize
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            chart.remove();
        };
    }, [theme]); // Re-create on theme change to update colors

    // Update data if it changes without remounting
    useEffect(() => {
        if (seriesRef.current && data.length > 0) {
            seriesRef.current.setData(data);
            chartRef.current?.timeScale().fitContent();
        }
    }, [data]);

    return (
        <div className="w-full h-[400px] border rounded-lg overflow-hidden bg-card text-card-foreground shadow-sm">
            <div ref={chartContainerRef} className="w-full h-full" />
        </div>
    );
}
