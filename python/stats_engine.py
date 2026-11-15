#!/usr/bin/env python3
"""
TERRA SLEUTH — Python Scientific & Statistical Analysis Engine
Pure Python 3.10 standard-library implementation of:
- OLS Linear Regression with 95% confidence intervals & Student-t p-value
- Mann-Kendall non-parametric trend test (with tie & Hamed-Rao autocorrelation correction)
- Sen's slope estimator & 95% CI
- Additive Seasonal Decomposition
- Z-score Anomaly & Sudden Change Detection
- Pettitt Change-Point Detection
- Acceleration / Deceleration & Reversal Detection
- Opposite Regional Trend Comparison
- Pearson, Spearman, Lagged Cross-Correlation & Regression Matrix
"""

import json
import math
import statistics
import sys
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Numerical Special Functions (Pure Python)
# ---------------------------------------------------------------------------

def _norm_cdf(z: float) -> float:
    return 0.5 * math.erfc(-z / math.sqrt(2.0))


def _norm_sf_two_sided(z: float) -> float:
    return math.erfc(abs(z) / math.sqrt(2.0))


def _betacf(a: float, b: float, x: float) -> float:
    MAXIT = 200
    EPS = 3.0e-12
    FPMIN = 1.0e-30
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    return h


def _betainc(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _student_t_two_tailed_p(t_stat: float, df: int) -> float:
    if df <= 0 or math.isnan(t_stat):
        return 1.0
    if math.isinf(t_stat):
        return 0.0
    x = df / (df + t_stat * t_stat)
    p = _betainc(0.5 * df, 0.5, x)
    return max(0.0, min(1.0, p))


def _t_critical_95(df: int) -> float:
    """Approximate two-tailed 95% Student-t critical value."""
    if df <= 1:
        return 12.706
    table = {
        2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
        8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086,
        25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980
    }
    if df in table:
        return table[df]
    if df > 120:
        return 1.96
    keys = sorted(table.keys())
    for i in range(len(keys) - 1):
        if keys[i] <= df <= keys[i + 1]:
            k0, k1 = keys[i], keys[i + 1]
            frac = (df - k0) / (k1 - k0)
            return table[k0] + frac * (table[k1] - table[k0])
    return 1.96


def _is_valid(v: Any) -> bool:
    if v is None:
        return False
    try:
        fv = float(v)
        return not (math.isnan(fv) or math.isinf(fv) or fv <= -900.0)
    except (TypeError, ValueError):
        return False


def _ranks(values: List[float]) -> List[float]:
    n = len(values)
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


# ---------------------------------------------------------------------------
# Core Time-Series Analysis
# ---------------------------------------------------------------------------

def _ols_regression(x: List[float], y: List[float]) -> Dict[str, Any]:
    n = len(x)
    if n < 3:
        return {
            "slope": 0.0, "intercept": y[0] if y else 0.0, "r2": 0.0,
            "se_slope": 0.0, "t_stat": 0.0, "p_value": 1.0,
            "fitted": y[:], "ci_low": y[:], "ci_high": y[:]
        }
    mx = sum(x) / n
    my = sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    syy = sum((yi - my) ** 2 for yi in y)

    if sxx == 0:
        return {
            "slope": 0.0, "intercept": my, "r2": 0.0,
            "se_slope": 0.0, "t_stat": 0.0, "p_value": 1.0,
            "fitted": [my] * n, "ci_low": [my] * n, "ci_high": [my] * n
        }

    slope = sxy / sxx
    intercept = my - slope * mx
    fitted = [slope * xi + intercept for xi in x]
    residuals = [yi - fi for yi, fi in zip(y, fitted)]
    sse = sum(r * r for r in residuals)
    r2 = 1.0 - (sse / syy) if syy > 0 else 0.0
    r2 = max(0.0, min(1.0, r2))

    df = n - 2
    s_err = math.sqrt(sse / df) if df > 0 else 0.0
    se_slope = s_err / math.sqrt(sxx) if sxx > 0 else 0.0
    t_stat = slope / se_slope if se_slope > 0 else 0.0
    p_value = _student_t_two_tailed_p(t_stat, df)
    t_crit = _t_critical_95(df)

    ci_low = []
    ci_high = []
    for xi, fi in zip(x, fitted):
        band = t_crit * s_err * math.sqrt((1.0 / n) + ((xi - mx) ** 2) / sxx)
        ci_low.append(round(fi - band, 5))
        ci_high.append(round(fi + band, 5))

    return {
        "slope": round(slope, 6),
        "intercept": round(intercept, 6),
        "r2": round(r2, 5),
        "se_slope": round(se_slope, 6),
        "t_stat": round(t_stat, 4),
        "p_value": round(p_value, 6),
        "fitted": [round(f, 5) for f in fitted],
        "ci_low": ci_low,
        "ci_high": ci_high,
        "residuals": [round(r, 5) for r in residuals],
    }


def _lag1_autocorrelation(series: List[float]) -> float:
    n = len(series)
    if n < 4:
        return 0.0
    mean = sum(series) / n
    num = sum((series[i] - mean) * (series[i + 1] - mean) for i in range(n - 1))
    den = sum((v - mean) ** 2 for v in series)
    if den == 0:
        return 0.0
    return max(-0.95, min(0.95, num / den))


def _mann_kendall(y: List[float]) -> Dict[str, Any]:
    n = len(y)
    if n < 4:
        return {
            "s_stat": 0, "z_stat": 0.0, "p_value": 1.0,
            "z_modified": 0.0, "p_modified": 1.0,
            "lag1_autocorr": 0.0, "significant": False, "trend": "insufficient_data"
        }

    s = 0
    for k in range(n - 1):
        yk = y[k]
        for j in range(k + 1, n):
            diff = y[j] - yk
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    # Tie groups
    counts: Dict[float, int] = {}
    for v in y:
        rv = round(v, 8)
        counts[rv] = counts.get(rv, 0) + 1
    tie_term = sum(t * (t - 1) * (2 * t + 5) for t in counts.values() if t > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if var_s <= 0:
        return {
            "s_stat": s, "z_stat": 0.0, "p_value": 1.0,
            "z_modified": 0.0, "p_modified": 1.0,
            "lag1_autocorr": 0.0, "significant": False, "trend": "stable"
        }

    if s > 0:
        z = (s - 1.0) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1.0) / math.sqrt(var_s)
    else:
        z = 0.0

    p_val = _norm_sf_two_sided(z)

    # Hamed & Rao (1998) lag-1 autocorrelation adjustment on detrended ranks
    r1 = _lag1_autocorrelation(y)
    if abs(r1) > 0.05 and n > 6:
        # Variance inflation factor for positive AR(1); floor at 1.0 to avoid false positives on alternating noise
        ess = 1.0 + 2.0 * sum(
            (1.0 - k / n) * (1.0 - k / (n - 1)) * (1.0 - k / (n - 2)) * (r1 ** k)
            for k in range(1, min(n - 2, 12))
        )
        ess = max(1.0, ess)
        var_mod = var_s * ess
    else:
        var_mod = var_s

    if s > 0:
        z_mod = (s - 1.0) / math.sqrt(var_mod)
    elif s < 0:
        z_mod = (s + 1.0) / math.sqrt(var_mod)
    else:
        z_mod = 0.0
    p_mod = _norm_sf_two_sided(z_mod)

    sig = p_mod < 0.05
    if sig and s > 0:
        trend = "increasing"
    elif sig and s < 0:
        trend = "decreasing"
    else:
        trend = "stable"

    return {
        "s_stat": s,
        "z_stat": round(z, 4),
        "p_value": round(p_val, 6),
        "z_modified": round(z_mod, 4),
        "p_modified": round(p_mod, 6),
        "lag1_autocorr": round(r1, 4),
        "significant": sig,
        "trend": trend,
    }


def _sens_slope(x: List[float], y: List[float]) -> Dict[str, Any]:
    n = len(y)
    if n < 3:
        return {"slope": 0.0, "intercept": y[0] if y else 0.0, "ci_low": 0.0, "ci_high": 0.0}
    slopes: List[float] = []
    for i in range(n - 1):
        for j in range(i + 1, n):
            dx = x[j] - x[i]
            if dx != 0:
                slopes.append((y[j] - y[i]) / dx)
    if not slopes:
        return {"slope": 0.0, "intercept": statistics.median(y), "ci_low": 0.0, "ci_high": 0.0}
    slopes.sort()
    med_slope = statistics.median(slopes)
    intercepts = [yi - med_slope * xi for xi, yi in zip(x, y)]
    med_intercept = statistics.median(intercepts)

    # 95% confidence interval for Sen's slope
    var_s = n * (n - 1) * (2 * n + 5) / 18.0
    c_alpha = 1.96 * math.sqrt(var_s)
    m_len = len(slopes)
    m1 = max(0, int((m_len - c_alpha) / 2.0))
    m2 = min(m_len - 1, int((m_len + c_alpha) / 2.0))

    return {
        "slope": round(med_slope, 6),
        "intercept": round(med_intercept, 6),
        "ci_low": round(slopes[m1], 6),
        "ci_high": round(slopes[m2], 6),
    }


def _seasonal_decomposition(dates: List[str], y: List[float], period: int = 12) -> Dict[str, Any]:
    n = len(y)
    if n < 6:
        return {
            "period": period,
            "trend": y[:],
            "seasonal": [0.0] * n,
            "residual": [0.0] * n,
            "deseasonalized": y[:],
            "seasonal_amplitude": 0.0,
        }
    eff_period = period if n >= period * 2 else max(3, min(7, n // 3))
    half = eff_period // 2
    trend: List[float] = []
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        trend.append(sum(y[lo:hi]) / (hi - lo))

    detrended = [yi - ti for yi, ti in zip(y, trend)]
    # Average seasonal component by phase
    buckets: Dict[int, List[float]] = {k: [] for k in range(eff_period)}
    for i, val in enumerate(detrended):
        buckets[i % eff_period].append(val)
    raw_seasonal = [
        (sum(buckets[k]) / len(buckets[k])) if buckets[k] else 0.0
        for k in range(eff_period)
    ]
    mean_s = sum(raw_seasonal) / eff_period
    centered_seasonal = [s - mean_s for s in raw_seasonal]
    seasonal = [centered_seasonal[i % eff_period] for i in range(n)]
    residual = [yi - ti - si for yi, ti, si in zip(y, trend, seasonal)]
    deseasonalized = [yi - si for yi, si in zip(y, seasonal)]

    return {
        "period": eff_period,
        "trend": [round(v, 5) for v in trend],
        "seasonal": [round(v, 5) for v in seasonal],
        "residual": [round(v, 5) for v in residual],
        "deseasonalized": [round(v, 5) for v in deseasonalized],
        "seasonal_amplitude": round(max(centered_seasonal) - min(centered_seasonal), 5) if centered_seasonal else 0.0,
    }


def _anomaly_detection(dates: List[str], y: List[float], residuals: Optional[List[float]] = None) -> Dict[str, Any]:
    n = len(y)
    if n < 4:
        return {"z_scores": [0.0] * n, "anomalies": [], "sudden_changes": [], "anomaly_count": 0}
    mean_y = statistics.mean(y)
    std_y = statistics.stdev(y) if n > 1 else 0.0
    z_scores = [((v - mean_y) / std_y) if std_y > 1e-9 else 0.0 for v in y]

    # Also compute residual z-scores if seasonal decomposition residuals provided
    res_z = z_scores
    if residuals and len(residuals) == n:
        std_r = statistics.stdev(residuals) if n > 1 else 0.0
        mean_r = statistics.mean(residuals)
        if std_r > 1e-9:
            res_z = [(r - mean_r) / std_r for r in residuals]

    anomalies = []
    for i, (d, v, z, rz) in enumerate(zip(dates, y, z_scores, res_z)):
        if abs(z) >= 2.0 or abs(rz) >= 2.2:
            anomalies.append({
                "index": i,
                "date": d,
                "value": round(v, 4),
                "z_score": round(z, 3),
                "deseasonalized_z": round(rz, 3),
                "direction": "positive_spike" if z > 0 else "negative_drop",
            })

    # Sudden step/jump detection using successive differences
    diffs = [abs(y[i] - y[i - 1]) for i in range(1, n)]
    med_diff = statistics.median(diffs) if diffs else 0.0
    sudden_changes = []
    if med_diff > 1e-9:
        for i in range(1, n):
            delta = y[i] - y[i - 1]
            if abs(delta) >= 3.5 * med_diff and abs(z_scores[i] - z_scores[i - 1]) >= 1.5:
                sudden_changes.append({
                    "index": i,
                    "date": dates[i],
                    "delta": round(delta, 4),
                    "prev_value": round(y[i - 1], 4),
                    "new_value": round(y[i], 4),
                })

    return {
        "mean": round(mean_y, 4),
        "std": round(std_y, 4),
        "z_scores": [round(z, 3) for z in z_scores],
        "anomalies": anomalies,
        "sudden_changes": sudden_changes,
        "anomaly_count": len(anomalies),
    }


def _pettitt_change_point(dates: List[str], y: List[float]) -> Dict[str, Any]:
    n = len(y)
    if n < 8:
        return {"detected": False, "change_date": None, "p_value": 1.0}
    ranks = _ranks(y)
    max_u = -1.0
    best_t = 0
    for t in range(1, n):
        u_t = abs(2.0 * sum(ranks[:t]) - t * (n + 1))
        if u_t > max_u:
            max_u = u_t
            best_t = t
    p_val = min(1.0, 2.0 * math.exp((-6.0 * (max_u ** 2)) / (n ** 3 + n ** 2)))
    pre_mean = statistics.mean(y[:best_t]) if best_t > 0 else y[0]
    post_mean = statistics.mean(y[best_t:]) if best_t < n else y[-1]
    return {
        "detected": p_val < 0.05,
        "index": best_t,
        "change_date": dates[best_t],
        "k_stat": round(max_u, 2),
        "p_value": round(p_val, 6),
        "pre_change_mean": round(pre_mean, 4),
        "post_change_mean": round(post_mean, 4),
        "shift_magnitude": round(post_mean - pre_mean, 4),
    }


def _acceleration_and_reversal(x: List[float], y: List[float]) -> Dict[str, Any]:
    n = len(y)
    if n < 8:
        return {"regime": "insufficient_data", "first_half_slope": 0.0, "second_half_slope": 0.0, "reversal_detected": False}
    mid = n // 2
    ols1 = _ols_regression(x[:mid], y[:mid])
    ols2 = _ols_regression(x[mid:], y[mid:])
    s1 = ols1["slope"]
    s2 = ols2["slope"]
    reversal = (s1 > 0 and s2 < 0 and ols2["p_value"] < 0.15) or (s1 < 0 and s2 > 0 and ols2["p_value"] < 0.15)
    if reversal:
        regime = "reversal_detected"
    elif abs(s2) > abs(s1) * 1.25 and (s1 * s2 >= 0):
        regime = "accelerating"
    elif abs(s2) < abs(s1) * 0.75 and (s1 * s2 >= 0):
        regime = "decelerating"
    else:
        regime = "steady_rate"

    return {
        "regime": regime,
        "first_half_slope": round(s1, 6),
        "second_half_slope": round(s2, 6),
        "slope_delta": round(s2 - s1, 6),
        "reversal_detected": reversal,
    }


def analyze_series(payload: Dict[str, Any]) -> Dict[str, Any]:
    dates_raw: List[str] = payload.get("dates", [])
    values_raw: List[Any] = payload.get("values", [])
    variable: str = payload.get("variable", "unknown")
    unit: str = payload.get("unit", "")

    total_points = len(values_raw)
    missing_count = 0
    valid_dates: List[str] = []
    valid_values: List[float] = []
    valid_x: List[float] = []

    for idx, (d, v) in enumerate(zip(dates_raw, values_raw)):
        if _is_valid(v):
            valid_dates.append(d)
            valid_values.append(float(v))
            valid_x.append(float(idx))
        else:
            missing_count += 1

    missing_pct = round((missing_count / total_points) * 100.0, 2) if total_points > 0 else 100.0
    n_valid = len(valid_values)

    if n_valid < 4:
        return {
            "variable": variable,
            "unit": unit,
            "total_points": total_points,
            "valid_points": n_valid,
            "missing_count": missing_count,
            "missing_pct": missing_pct,
            "status": "insufficient_data",
            "classification": "insufficient_data",
            "dates": valid_dates,
            "values": valid_values,
        }

    ols = _ols_regression(valid_x, valid_values)
    mk = _mann_kendall(valid_values)
    sen = _sens_slope(valid_x, valid_values)
    decomp = _seasonal_decomposition(valid_dates, valid_values)
    mk_deseason = _mann_kendall(decomp["deseasonalized"])
    anomalies = _anomaly_detection(valid_dates, valid_values, decomp["residual"])
    changepoint = _pettitt_change_point(valid_dates, valid_values)
    accel = _acceleration_and_reversal(valid_x, valid_values)

    initial_val = valid_values[0]
    final_val = valid_values[-1]
    abs_change = final_val - initial_val
    # Use fitted endpoint change for trend-based magnitude to reduce endpoint noise
    fitted_change = ols["fitted"][-1] - ols["fitted"][0]
    pct_change = ((abs_change / abs(initial_val)) * 100.0) if abs(initial_val) > 1e-6 else None

    # Classify overall trend combining Mann-Kendall (deseasonalized & raw) and OLS
    if (mk["significant"] or mk_deseason["significant"] or ols["p_value"] < 0.05):
        if ols["slope"] > 0 and sen["slope"] >= 0:
            classification = "increasing"
        elif ols["slope"] < 0 and sen["slope"] <= 0:
            classification = "decreasing"
        else:
            classification = mk_deseason["trend"] if mk_deseason["trend"] != "insufficient_data" else "stable"
    else:
        classification = "stable"

    return {
        "variable": variable,
        "unit": unit,
        "status": "ok",
        "total_points": total_points,
        "valid_points": n_valid,
        "missing_count": missing_count,
        "missing_pct": missing_pct,
        "start_date": valid_dates[0],
        "end_date": valid_dates[-1],
        "initial_value": round(initial_val, 4),
        "final_value": round(final_val, 4),
        "mean_value": round(statistics.mean(valid_values), 4),
        "min_value": round(min(valid_values), 4),
        "max_value": round(max(valid_values), 4),
        "absolute_change": round(abs_change, 4),
        "trend_net_change": round(fitted_change, 4),
        "percent_change": round(pct_change, 2) if pct_change is not None else None,
        "classification": classification,
        "ols": ols,
        "mann_kendall": mk,
        "mann_kendall_deseasonalized": mk_deseason,
        "sens_slope": sen,
        "seasonal_decomposition": decomp,
        "anomalies": anomalies,
        "change_point": changepoint,
        "acceleration": accel,
        "dates": valid_dates,
        "values": [round(v, 4) for v in valid_values],
    }


# ---------------------------------------------------------------------------
# Opposite Trend Detector
# ---------------------------------------------------------------------------

def compare_opposite_trends(payload: Dict[str, Any]) -> Dict[str, Any]:
    region_a = payload.get("region_a", {})
    region_b = payload.get("region_b", {})

    res_a = analyze_series(region_a)
    res_b = analyze_series(region_b)

    if res_a.get("status") != "ok" or res_b.get("status") != "ok":
        return {
            "compatible": False,
            "opposite_trends_detected": False,
            "reason": "One or both regions lack sufficient valid observations.",
            "region_a": res_a,
            "region_b": res_b,
        }

    unit_a = res_a.get("unit", "")
    unit_b = res_b.get("unit", "")
    if unit_a != unit_b:
        return {
            "compatible": False,
            "opposite_trends_detected": False,
            "reason": f"Incompatible units: {unit_a} vs {unit_b}.",
            "region_a": res_a,
            "region_b": res_b,
        }

    # Align by date for difference series
    map_a = dict(zip(res_a["dates"], res_a["values"]))
    map_b = dict(zip(res_b["dates"], res_b["values"]))
    common_dates = sorted(set(map_a.keys()) & set(map_b.keys()))
    diff_series = [round(map_a[d] - map_b[d], 4) for d in common_dates]

    slope_a = res_a["ols"]["slope"]
    slope_b = res_b["ols"]["slope"]
    se_a = res_a["ols"]["se_slope"]
    se_b = res_b["ols"]["se_slope"]

    denom = math.sqrt(se_a ** 2 + se_b ** 2)
    if denom > 1e-12:
        z_diff = (slope_a - slope_b) / denom
        p_diff = _norm_sf_two_sided(z_diff)
    elif abs(slope_a - slope_b) > 1e-12:
        z_diff = 999.0 if slope_a > slope_b else -999.0
        p_diff = 0.0
    else:
        z_diff = 0.0
        p_diff = 1.0

    opposite_signs = (
        (res_a["classification"] == "increasing" and res_b["classification"] == "decreasing") or
        (res_a["classification"] == "decreasing" and res_b["classification"] == "increasing")
    )
    # Also check raw directional divergence if statistically distinct
    directional_opposite = (slope_a * slope_b < 0) and (p_diff < 0.05)
    detected = bool(opposite_signs or directional_opposite)

    return {
        "compatible": True,
        "variable": res_a["variable"],
        "unit": unit_a,
        "common_dates_count": len(common_dates),
        "common_dates": common_dates,
        "difference_series": diff_series,
        "mean_difference": round(statistics.mean(diff_series), 4) if diff_series else 0.0,
        "slope_difference": round(slope_a - slope_b, 6),
        "slope_diff_z": round(z_diff, 4),
        "slope_diff_p_value": round(p_diff, 6),
        "opposite_trends_detected": detected,
        "summary": (
            f"Opposite trends verified ({res_a['classification']} vs {res_b['classification']}, slope diff p={round(p_diff, 4)})"
            if detected
            else f"No statistically opposite trend divergence detected ({res_a['classification']} vs {res_b['classification']}, p={round(p_diff, 4)})"
        ),
        "region_a_name": region_a.get("region_name", "Region A"),
        "region_b_name": region_b.get("region_name", "Region B"),
        "region_a": res_a,
        "region_b": res_b,
    }


# ---------------------------------------------------------------------------
# Relationship Analyst (Pearson, Spearman, Lagged Cross-Correlation, Matrix)
# ---------------------------------------------------------------------------

def _pearson(x: List[float], y: List[float]) -> Tuple[float, float]:
    n = len(x)
    if n < 4:
        return 0.0, 1.0
    mx = sum(x) / n
    my = sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    syy = sum((yi - my) ** 2 for yi in y)
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    if sxx <= 1e-12 or syy <= 1e-12:
        return 0.0, 1.0
    r = max(-1.0, min(1.0, sxy / math.sqrt(sxx * syy)))
    if abs(r) >= 0.999999:
        return r, 0.0
    t_stat = r * math.sqrt((n - 2) / (1.0 - r * r))
    p_val = _student_t_two_tailed_p(t_stat, n - 2)
    return r, p_val


def _spearman(x: List[float], y: List[float]) -> Tuple[float, float]:
    n = len(x)
    if n < 4:
        return 0.0, 1.0
    rx = _ranks(x)
    ry = _ranks(y)
    return _pearson(rx, ry)


def analyze_relationships(payload: Dict[str, Any]) -> Dict[str, Any]:
    series_map: Dict[str, Dict[str, Any]] = payload.get("series", {})
    names = list(series_map.keys())
    if len(names) < 2:
        return {"status": "insufficient_variables", "pairs": [], "matrix": []}

    # Build date-indexed maps for valid points
    aligned_maps: Dict[str, Dict[str, float]] = {}
    units: Dict[str, str] = {}
    for k, s in series_map.items():
        units[k] = s.get("unit", "")
        m: Dict[str, float] = {}
        for d, v in zip(s.get("dates", []), s.get("values", [])):
            if _is_valid(v):
                m[d] = float(v)
        aligned_maps[k] = m

    # Correlation Matrix (Pearson)
    matrix: List[List[Optional[float]]] = []
    for k1 in names:
        row: List[Optional[float]] = []
        for k2 in names:
            if k1 == k2:
                row.append(1.0)
                continue
            common = sorted(set(aligned_maps[k1].keys()) & set(aligned_maps[k2].keys()))
            if len(common) < 4:
                row.append(None)
                continue
            x = [aligned_maps[k1][d] for d in common]
            y = [aligned_maps[k2][d] for d in common]
            r, _ = _pearson(x, y)
            row.append(round(r, 4))
        matrix.append(row)

    # Detailed pairwise analysis
    pairs = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            k1, k2 = names[i], names[j]
            common = sorted(set(aligned_maps[k1].keys()) & set(aligned_maps[k2].keys()))
            if len(common) < 6:
                continue
            x = [aligned_maps[k1][d] for d in common]
            y = [aligned_maps[k2][d] for d in common]

            pr, pp = _pearson(x, y)
            sr, sp = _spearman(x, y)
            reg = _ols_regression(x, y)

            # Lagged cross-correlation (-6 to +6)
            max_lag = min(6, len(common) // 4)
            lags = []
            best_lag = 0
            best_lag_r = pr
            for lag in range(-max_lag, max_lag + 1):
                if lag < 0:
                    xs = x[-lag:]
                    ys = y[:len(y) + lag]
                elif lag > 0:
                    xs = x[:-lag]
                    ys = y[lag:]
                else:
                    xs, ys = x, y
                if len(xs) >= 5:
                    lr, lp = _pearson(xs, ys)
                    lags.append({"lag": lag, "r": round(lr, 4), "p_value": round(lp, 6)})
                    if abs(lr) > abs(best_lag_r):
                        best_lag_r = lr
                        best_lag = lag

            # Environmental concern classification based on statistical strength & variable domain
            abs_r = abs(pr)
            if pp < 0.05 and abs_r >= 0.55:
                strength = "strong"
            elif pp < 0.05 and abs_r >= 0.30:
                strength = "moderate"
            else:
                strength = "weak_or_insignificant"

            # Concern assessment (correlation != causation!)
            concern = "YELLOW — MODERATE CONCERN"
            if strength == "strong":
                if ("T2M" in k1 or "TS" in k1 or "T2M" in k2 or "TS" in k2) and pr < -0.5:
                    concern = "RED — HIGH CONCERN"
                elif ("PRECTOTCORR" in k1 or "PRECTOTCORR" in k2) and ("GWET" in k1 or "GWET" in k2 or "NDVI" in k1 or "NDVI" in k2) and pr > 0.5:
                    concern = "GREEN — IMPROVING / ACCEPTABLE"
                else:
                    concern = "YELLOW — MODERATE CONCERN"
            elif strength == "weak_or_insignificant":
                concern = "GREEN — IMPROVING / ACCEPTABLE"

            scatter = [{"x": round(xi, 4), "y": round(yi, 4), "date": d} for d, xi, yi in zip(common, x, y)]

            pairs.append({
                "var_x": k1,
                "var_y": k2,
                "unit_x": units[k1],
                "unit_y": units[k2],
                "sample_size": len(common),
                "pearson_r": round(pr, 4),
                "pearson_p": round(pp, 6),
                "spearman_rho": round(sr, 4),
                "spearman_p": round(sp, 6),
                "regression": {
                    "slope": reg["slope"],
                    "intercept": reg["intercept"],
                    "r2": reg["r2"],
                },
                "best_lag": best_lag,
                "best_lag_r": round(best_lag_r, 4),
                "lag_profile": lags,
                "strength": strength,
                "concern_level": concern,
                "scatter_points": scatter,
                "common_dates": common,
                "values_x": [round(v, 4) for v in x],
                "values_y": [round(v, 4) for v in y],
            })

    return {
        "status": "ok",
        "variables": names,
        "units": units,
        "matrix": matrix,
        "pairs": pairs,
    }


# ---------------------------------------------------------------------------
# Challenger Projection & Uncertainty Audit
# ---------------------------------------------------------------------------

def evaluate_challenge_metrics(payload: Dict[str, Any]) -> Dict[str, Any]:
    series_list = payload.get("series_results", [])
    horizon = int(payload.get("projection_steps", 12))
    projections = []

    for s in series_list:
        if s.get("status") != "ok":
            continue
        vals = s.get("values", [])
        dates = s.get("dates", [])
        ols = s.get("ols", {})
        n = len(vals)
        if n < 6:
            continue

        slope = ols.get("slope", 0.0)
        intercept = ols.get("intercept", vals[-1])
        residuals = ols.get("residuals", [])
        res_std = statistics.stdev(residuals) if len(residuals) > 2 else (statistics.stdev(vals) * 0.2)

        proj_points = []
        for step in range(1, horizon + 1):
            idx = n - 1 + step
            pred = slope * idx + intercept
            # Uncertainty widens with sqrt(step)
            half_band = 1.96 * res_std * math.sqrt(1.0 + step / max(4, n / 2.0))
            proj_points.append({
                "step": step,
                "label": f"+{step}",
                "projected": round(pred, 4),
                "ci_low": round(pred - half_band, 4),
                "ci_high": round(pred + half_band, 4),
            })

        # Quantitative reliability audit
        missing_pct = s.get("missing_pct", 0.0)
        autocorr = abs(s.get("mann_kendall", {}).get("lag1_autocorr", 0.0))
        mk_p = s.get("mann_kendall_deseasonalized", {}).get("p_modified", 1.0)
        ols_p = ols.get("p_value", 1.0)
        agreement = (mk_p < 0.05) == (ols_p < 0.05)

        reliability_score = max(
            10.0,
            min(
                98.0,
                100.0
                - missing_pct * 1.1
                - (20.0 if n < 18 else 5.0 if n < 36 else 0.0)
                - (autocorr * 22.0)
                - (0.0 if agreement else 15.0)
            )
        )

        projections.append({
            "variable": s.get("variable"),
            "unit": s.get("unit"),
            "historical_tail_dates": dates[-min(24, n):],
            "historical_tail_values": vals[-min(24, n):],
            "projection": proj_points,
            "reliability_score": round(reliability_score, 1),
            "missing_pct": missing_pct,
            "autocorr": round(autocorr, 3),
            "method_agreement": agreement,
            "uncertainty_width_final": round(proj_points[-1]["ci_high"] - proj_points[-1]["ci_low"], 4),
        })

    return {"status": "ok", "projections": projections}


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "Empty JSON payload"}))
        sys.exit(1)
    req = json.loads(raw)
    task = req.get("task")
    payload = req.get("payload", {})

    if task == "analyze_series":
        out = analyze_series(payload)
    elif task == "compare_opposite_trends":
        out = compare_opposite_trends(payload)
    elif task == "analyze_relationships":
        out = analyze_relationships(payload)
    elif task == "evaluate_challenge_metrics":
        out = evaluate_challenge_metrics(payload)
    elif task == "batch_investigation":
        series_list = payload.get("series", [])
        analyzed = [analyze_series(s) for s in series_list]
        opposite = [compare_opposite_trends(c) for c in payload.get("comparisons", [])]
        rel_input = {"series": {s["variable"]: s for s in series_list if "variable" in s}}
        relationships = analyze_relationships(rel_input)
        challenge = evaluate_challenge_metrics({"series_results": analyzed, "projection_steps": 12})
        out = {
            "status": "ok",
            "trends": analyzed,
            "opposite_trends": opposite,
            "relationships": relationships,
            "challenge_metrics": challenge,
        }
    else:
        out = {"error": f"Unknown task: {task}"}

    print(json.dumps(out))


if __name__ == "__main__":
    main()
