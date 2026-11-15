import unittest
from python.stats_engine import (
    analyze_series,
    compare_opposite_trends,
    analyze_relationships,
    evaluate_challenge_metrics,
)


class TestTerraSleuthStatsEngine(unittest.TestCase):
    def setUp(self):
        self.dates = [f"2023-{m:02d}-01" for m in range(1, 13)] + [f"2024-{m:02d}-01" for m in range(1, 13)]

    def test_increasing_trend_detection(self):
        values = [20.0 + i * 0.6 + (0.2 if i % 2 == 0 else -0.2) for i in range(24)]
        res = analyze_series({"dates": self.dates, "values": values, "variable": "T2M", "unit": "°C"})
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["classification"], "increasing")
        self.assertGreater(res["ols"]["slope"], 0.4)
        self.assertLess(res["ols"]["p_value"], 0.01)
        self.assertGreater(res["sens_slope"]["slope"], 0.4)
        self.assertEqual(res["mann_kendall"]["trend"], "increasing")

    def test_decreasing_trend_detection(self):
        values = [0.80 - i * 0.02 + (0.005 if i % 3 == 0 else 0.0) for i in range(24)]
        res = analyze_series({"dates": self.dates, "values": values, "variable": "GWETTOP", "unit": "index"})
        self.assertEqual(res["classification"], "decreasing")
        self.assertLess(res["ols"]["slope"], -0.01)
        self.assertLess(res["mann_kendall"]["p_value"], 0.01)

    def test_stable_trend_detection(self):
        values = [50.0 + (0.5 if i % 2 == 0 else -0.5) for i in range(24)]
        res = analyze_series({"dates": self.dates, "values": values, "variable": "RH2M", "unit": "%"})
        self.assertEqual(res["classification"], "stable")
        self.assertGreater(res["ols"]["p_value"], 0.05)

    def test_missing_values_and_anomalies(self):
        values = [10.0 + (0.1 if i % 2 == 0 else -0.1) for i in range(24)]
        values[5] = None
        values[10] = -999.0
        values[15] = 35.0  # strong positive anomaly
        res = analyze_series({"dates": self.dates, "values": values, "variable": "PRECTOTCORR", "unit": "mm/day"})
        self.assertEqual(res["missing_count"], 2)
        self.assertAlmostEqual(res["missing_pct"], 8.33, places=2)
        self.assertGreaterEqual(res["anomalies"]["anomaly_count"], 1)
        anomaly_dates = [a["date"] for a in res["anomalies"]["anomalies"]]
        self.assertIn(self.dates[15], anomaly_dates)

    def test_opposite_regional_trends(self):
        vals_a = [0.40 + i * 0.015 for i in range(24)]
        vals_b = [0.75 - i * 0.015 for i in range(24)]
        comp = compare_opposite_trends({
            "region_a": {"region_name": "Malnad", "dates": self.dates, "values": vals_a, "variable": "GWETROOT", "unit": "index"},
            "region_b": {"region_name": "Raichur", "dates": self.dates, "values": vals_b, "variable": "GWETROOT", "unit": "index"},
        })
        self.assertTrue(comp["compatible"])
        self.assertTrue(comp["opposite_trends_detected"])
        self.assertLess(comp["slope_diff_p_value"], 0.001)

    def test_relationship_correlation_and_lag(self):
        rain = [5.0 + (i % 6) * 2.5 for i in range(24)]
        soil = [0.35] + [0.35 + rain[i - 1] * 0.02 for i in range(1, 24)]
        rel = analyze_relationships({
            "series": {
                "PRECTOTCORR": {"dates": self.dates, "values": rain, "unit": "mm/day"},
                "GWETTOP": {"dates": self.dates, "values": soil, "unit": "index"},
            }
        })
        self.assertEqual(rel["status"], "ok")
        self.assertEqual(len(rel["pairs"]), 1)
        pair = rel["pairs"][0]
        self.assertEqual(pair["best_lag"], 1)
        self.assertGreater(pair["best_lag_r"], 0.85)

    def test_challenge_projections(self):
        vals = [25.0 + i * 0.3 for i in range(24)]
        s = analyze_series({"dates": self.dates, "values": vals, "variable": "T2M", "unit": "°C"})
        ch = evaluate_challenge_metrics({"series_results": [s], "projection_steps": 6})
        self.assertEqual(len(ch["projections"]), 1)
        self.assertEqual(len(ch["projections"][0]["projection"]), 6)


if __name__ == "__main__":
    unittest.main()
