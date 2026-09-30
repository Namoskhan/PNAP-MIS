import os
import matplotlib.pyplot as plt
import numpy as np

os.makedirs('performance-tests/final-management-report/charts', exist_ok=True)
charts_dir = 'performance-tests/final-management-report/charts'

# Style Configuration
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']
plt.rcParams['axes.edgecolor'] = '#CBD5E1'
plt.rcParams['axes.linewidth'] = 1.0

COLOR_BEFORE = '#DC2626'  # Crimson/Red
COLOR_AFTER = '#0D9488'   # Deep Teal
COLOR_ACCENT = '#2563EB'  # Royal Blue
COLOR_BG = '#F8FAFC'      # Light Slate

# -------------------------------------------------------------
# CHART 1: 50k Stored-Member Performance — Before vs After
# -------------------------------------------------------------
categories = ['Area Officer', 'Basic Unit Officer', 'Cold Snapshot', 'Group-3 Overview', 'Staged Dashboard']
before_s = [3.3598, 6.5408, 11.6999, 13.9433, 12.9804]
after_s  = [0.3685, 0.7179, 0.8746,  1.1968,  2.0140]

y = np.arange(len(categories))
height = 0.35

fig, ax = plt.subplots(figsize=(10, 6), dpi=300)
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

rects1 = ax.barh(y + height/2, before_s, height, label='Before Optimization (O7/O8)', color=COLOR_BEFORE, alpha=0.9)
rects2 = ax.barh(y - height/2, after_s, height, label='Final Optimized (O10)', color=COLOR_AFTER, alpha=0.9)

ax.set_xlabel('Latency in Seconds (P95) — Lower is Better', fontsize=11, fontweight='bold', color='#1E293B', labelpad=10)
ax.set_title('50k Stored-Member Workload Performance — Before vs After Optimization', fontsize=13, fontweight='bold', color='#0F172A', pad=15)
ax.set_yticks(y)
ax.set_yticklabels(categories, fontsize=10, fontweight='bold', color='#334155')
ax.legend(frameon=True, facecolor='#F1F5F9', edgecolor='none', fontsize=10, loc='lower right')
ax.grid(axis='x', linestyle='--', alpha=0.5, color='#94A3B8')

for rect in rects1:
    w = rect.get_width()
    ax.annotate(f'{w:.2f} s', xy=(w, rect.get_y() + rect.get_height()/2), xytext=(5, 0),
                textcoords="offset points", ha='left', va='center', fontsize=9, fontweight='bold', color=COLOR_BEFORE)

for rect in rects2:
    w = rect.get_width()
    ax.annotate(f'{w:.2f} s', xy=(w, rect.get_y() + rect.get_height()/2), xytext=(5, 0),
                textcoords="offset points", ha='left', va='center', fontsize=9, fontweight='bold', color=COLOR_AFTER)

ax.set_xlim(0, 16)
plt.tight_layout()
plt.savefig(os.path.join(charts_dir, 'chart1_50k_backend_before_after.png'))
plt.close()
print("Chart 1 generated.")

# -------------------------------------------------------------
# CHART 2: Latency Reduction Percentage
# -------------------------------------------------------------
reductions = [89.03, 89.02, 92.52, 91.42, 84.48]

fig, ax = plt.subplots(figsize=(10, 5), dpi=300)
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

bars = ax.barh(categories, reductions, height=0.5, color='#059669', alpha=0.9)
ax.set_xlabel('Latency Reduction (%) — Higher is Better', fontsize=11, fontweight='bold', color='#1E293B', labelpad=10)
ax.set_title('Latency Reduction After Optimization (50k Stored Members)', fontsize=13, fontweight='bold', color='#0F172A', pad=15)
ax.set_xlim(0, 105)
ax.grid(axis='x', linestyle='--', alpha=0.5, color='#94A3B8')

for bar in bars:
    w = bar.get_width()
    ax.annotate(f'{w:.2f}%', xy=(w, bar.get_y() + bar.get_height()/2), xytext=(5, 0),
                textcoords="offset points", ha='left', va='center', fontsize=10, fontweight='bold', color='#065F46')

plt.tight_layout()
plt.savefig(os.path.join(charts_dir, 'chart2_latency_percentage_reduction.png'))
plt.close()
print("Chart 2 generated.")

# -------------------------------------------------------------
# CHART 3: Concurrent Dashboard Workflows
# -------------------------------------------------------------
concurrency_levels = ['1 Workflow', '3 Workflows', '5 Workflows', '10 Workflows']
c_before = [11.186, 12.621, 16.495, 26.359]
c_after  = [1.864,  2.733,  4.102,  7.573]

x = np.arange(len(concurrency_levels))
width = 0.35

fig, ax = plt.subplots(figsize=(10, 6), dpi=300)
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

rects1 = ax.bar(x - width/2, c_before, width, label='Before Optimization (O7 Baseline)', color=COLOR_BEFORE, alpha=0.9)
rects2 = ax.bar(x + width/2, c_after, width, label='Final Optimized (O10)', color=COLOR_AFTER, alpha=0.9)

ax.set_ylabel('Latency in Seconds (P95) — Lower is Better', fontsize=11, fontweight='bold', color='#1E293B', labelpad=10)
ax.set_title('Concurrent Staged Dashboard Workflows (50k Stored Members) — Before vs Final', fontsize=13, fontweight='bold', color='#0F172A', pad=15)
ax.set_xticks(x)
ax.set_xticklabels(concurrency_levels, fontsize=10, fontweight='bold', color='#334155')
ax.legend(frameon=True, facecolor='#F1F5F9', edgecolor='none', fontsize=10, loc='upper left')
ax.grid(axis='y', linestyle='--', alpha=0.5, color='#94A3B8')

for rect in rects1:
    h = rect.get_height()
    ax.annotate(f'{h:.2f} s', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                textcoords="offset points", ha='center', va='bottom', fontsize=9, fontweight='bold', color=COLOR_BEFORE)

for rect in rects2:
    h = rect.get_height()
    ax.annotate(f'{h:.2f} s', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                textcoords="offset points", ha='center', va='bottom', fontsize=9, fontweight='bold', color=COLOR_AFTER)

ax.set_ylim(0, 30)
plt.tight_layout()
plt.savefig(os.path.join(charts_dir, 'chart3_concurrency_before_after.png'))
plt.close()
print("Chart 3 generated.")

# -------------------------------------------------------------
# CHART 4: Frontend Initial JavaScript Reduction
# -------------------------------------------------------------
bundle_cats = ['Raw Initial JS', 'Gzip Initial JS']
bundle_before = [944.6, 234.9]
bundle_after  = [297.2, 92.9]

x = np.arange(len(bundle_cats))
width = 0.35

fig, ax = plt.subplots(figsize=(8, 5), dpi=300)
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

rects1 = ax.bar(x - width/2, bundle_before, width, label='Before Code Splitting (Pre-O9)', color='#64748B', alpha=0.9)
rects2 = ax.bar(x + width/2, bundle_after, width, label='Final Optimized (O10 / O9)', color='#2563EB', alpha=0.9)

ax.set_ylabel('Payload Size in Kilobytes (KB) — Lower is Better', fontsize=11, fontweight='bold', color='#1E293B', labelpad=10)
ax.set_title('Frontend Initial JavaScript Reduction via Route-Level Code Splitting', fontsize=12, fontweight='bold', color='#0F172A', pad=15)
ax.set_xticks(x)
ax.set_xticklabels(bundle_cats, fontsize=10, fontweight='bold', color='#334155')
ax.legend(frameon=True, facecolor='#F1F5F9', edgecolor='none', fontsize=10, loc='upper right')
ax.grid(axis='y', linestyle='--', alpha=0.5, color='#94A3B8')

for rect in rects1:
    h = rect.get_height()
    ax.annotate(f'{h:.1f} KB', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                textcoords="offset points", ha='center', va='bottom', fontsize=10, fontweight='bold', color='#475569')

for rect in rects2:
    h = rect.get_height()
    ax.annotate(f'{h:.1f} KB', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                textcoords="offset points", ha='center', va='bottom', fontsize=10, fontweight='bold', color='#1D4ED8')

# Callout annotation
ax.annotate('-68.5% Raw', xy=(0.18, 310), xytext=(0.35, 500),
            arrowprops=dict(facecolor='#1D4ED8', shrink=0.05, width=1.5, headwidth=6),
            fontsize=10, fontweight='bold', color='#1D4ED8')

ax.annotate('-60.5% Gzip', xy=(1.18, 105), xytext=(1.25, 250),
            arrowprops=dict(facecolor='#1D4ED8', shrink=0.05, width=1.5, headwidth=6),
            fontsize=10, fontweight='bold', color='#1D4ED8')

ax.set_ylim(0, 1100)
plt.tight_layout()
plt.savefig(os.path.join(charts_dir, 'chart4_frontend_initial_js.png'))
plt.close()
print("Chart 4 generated.")

# -------------------------------------------------------------
# CHART 5: Frontend Experience (Lighthouse & Paint Timing)
# -------------------------------------------------------------
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 5), dpi=300)
fig.patch.set_facecolor('white')

# Subplot 1: Score
scores = [89, 100]
bars_s = ax1.bar(['Pre-O9 Baseline', 'Final O10'], scores, width=0.45, color=['#F59E0B', '#10B981'], alpha=0.9)
ax1.set_title('Lighthouse Performance Score\n(Higher is Better)', fontsize=11, fontweight='bold', color='#0F172A', pad=12)
ax1.set_ylabel('Score out of 100', fontsize=10, fontweight='bold', color='#334155')
ax1.set_ylim(0, 115)
ax1.grid(axis='y', linestyle='--', alpha=0.5, color='#94A3B8')
for bar in bars_s:
    h = bar.get_height()
    ax1.annotate(f'{int(h)} / 100', xy=(bar.get_x() + bar.get_width()/2, h), xytext=(0, 4),
                 textcoords="offset points", ha='center', va='bottom', fontsize=10, fontweight='bold', color='#0F172A')

# Subplot 2: Timings
timing_cats = ['FCP / LCP', 'Speed Index']
t_before = [2.824, 3.903]
t_after  = [1.416, 1.983]

x2 = np.arange(len(timing_cats))
w2 = 0.35
rects_t1 = ax2.bar(x2 - w2/2, t_before, w2, label='Pre-O9 Baseline', color=COLOR_BEFORE, alpha=0.85)
rects_t2 = ax2.bar(x2 + w2/2, t_after, w2, label='Final O10', color=COLOR_AFTER, alpha=0.85)

ax2.set_title('Visual Rendering Latency\n(Lower is Better)', fontsize=11, fontweight='bold', color='#0F172A', pad=12)
ax2.set_ylabel('Time in Seconds (Median)', fontsize=10, fontweight='bold', color='#334155')
ax2.set_xticks(x2)
ax2.set_xticklabels(timing_cats, fontsize=10, fontweight='bold', color='#334155')
ax2.legend(frameon=True, facecolor='#F1F5F9', edgecolor='none', fontsize=9, loc='upper right')
ax2.grid(axis='y', linestyle='--', alpha=0.5, color='#94A3B8')

for rect in rects_t1:
    h = rect.get_height()
    ax2.annotate(f'{h:.2f} s', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                 textcoords="offset points", ha='center', va='bottom', fontsize=9, fontweight='bold', color=COLOR_BEFORE)

for rect in rects_t2:
    h = rect.get_height()
    ax2.annotate(f'{h:.2f} s', xy=(rect.get_x() + rect.get_width()/2, h), xytext=(0, 4),
                 textcoords="offset points", ha='center', va='bottom', fontsize=9, fontweight='bold', color=COLOR_AFTER)

ax2.set_ylim(0, 4.8)

plt.tight_layout()
plt.savefig(os.path.join(charts_dir, 'chart5_frontend_experience.png'))
plt.close()
print("Chart 5 generated.")
print("All 5 high-resolution charts generated successfully!")
