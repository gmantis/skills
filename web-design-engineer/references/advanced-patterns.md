# Advanced Reference: Component Patterns & Code Templates

This file contains advanced patterns and ready-to-adapt code templates for common web design tasks.

---

## Table of Contents

1. [Responsive Slide Engine](#responsive-slide-engine)
2. [Device Simulation Frames](#device-simulation-frames)
3. [Tweaks Panel Implementation](#tweaks-panel-implementation)
4. [Animation Timeline Engine](#animation-timeline-engine)
5. [Design Canvas (Multi-option Comparison)](#design-canvas)
6. [Dark Mode Toggle](#dark-mode-toggle)
7. [Data Visualization Templates](#data-visualization-templates)
8. [okLCH Color System](#oklch-color-system)

---

## Responsive Slide Engine

For fixed-size presentations that auto-fit to any viewport.

**Key conventions**:
- Internal arrays use 0-indexing, **but numbers shown to users are always 1-indexed**
- Each slide gets `data-screen-label="01 Title"`, `data-screen-label="02 Agenda"`, etc.
- Control buttons go **outside** the `.stage` scaled container for usability on small screens

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0b; color: #fafafa; font-family: 'Outfit', sans-serif; }
    
    .presentation-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .stage {
      width: 1920px;
      height: 1080px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      transform-origin: center;
      overflow: hidden;
      position: relative;
    }
    
    .slide {
      position: absolute;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .slide.active { opacity: 1; }
    
    .controls {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      align-items: center;
    }
    
    button {
      padding: 8px 16px;
      background: oklch(0.55 0.25 250);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    button:hover { background: oklch(0.65 0.25 250); }
    
    .slide-counter {
      color: #a1a1aa;
      font-size: 14px;
      min-width: 80px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="presentation-container">
    <div class="stage" id="stage">
      <div class="slide active" data-screen-label="01 Title">
        <h1>Slide 1</h1>
      </div>
      <div class="slide" data-screen-label="02 Content">
        <h1>Slide 2</h1>
      </div>
    </div>
    
    <div class="controls">
      <button onclick="previousSlide()">← Previous</button>
      <span class="slide-counter"><span id="current">1</span> / <span id="total">2</span></span>
      <button onclick="nextSlide()">Next →</button>
    </div>
  </div>

  <script>
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const totalSlides = slides.length;
    const scale = window.innerHeight / 1080 * 0.9;
    
    document.getElementById('stage').style.transform = `scale(${scale})`;
    document.getElementById('total').textContent = totalSlides;
    
    function showSlide(n) {
      slides.forEach(s => s.classList.remove('active'));
      slides[n].classList.add('active');
      document.getElementById('current').textContent = n + 1;
    }
    
    function nextSlide() {
      currentSlide = (currentSlide + 1) % totalSlides;
      showSlide(currentSlide);
    }
    
    function previousSlide() {
      currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
      showSlide(currentSlide);
    }
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') previousSlide();
    });
  </script>
</body>
</html>
```

---

## Device Simulation Frames

### iPhone Frame

```jsx
const IPhoneFrame = ({ children, title = "App" }) => (
  <div style={{
    width: 375,
    height: 812,
    border: '12px solid #000',
    borderRadius: 40,
    overflow: 'hidden',
    background: '#fff',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    position: 'relative'
  }}>
    {/* Status bar */}
    <div style={{
      height: 44,
      background: '#000',
      color: '#fff',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      fontSize: 12,
      fontWeight: 600
    }}>
      <span>9:41</span>
      <span>⚡ 📶</span>
    </div>
    
    {/* Content */}
    <div style={{ height: 'calc(100% - 44px - 34px)', overflow: 'auto' }}>
      {children}
    </div>
    
    {/* Home indicator */}
    <div style={{
      height: 34,
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: 120,
        height: 4,
        background: '#555',
        borderRadius: 2
      }} />
    </div>
  </div>
);
```

### Browser Window Frame

```jsx
const BrowserFrame = ({ children, url = "https://example.com", title = "Page" }) => (
  <div style={{
    width: '100%',
    border: '1px solid #ccc',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
  }}>
    {/* Title bar */}
    <div style={{
      height: 40,
      background: '#f5f5f5',
      borderBottom: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      fontSize: 12,
      color: '#666'
    }}>
      {url}
    </div>
    
    {/* Content */}
    <div>
      {children}
    </div>
  </div>
);
```

---

## Tweaks Panel Implementation

```jsx
const TweaksPanel = ({ config, onChange, visible }) => {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: 'rgba(0,0,0,0.9)',
      color: '#fff',
      padding: 16,
      borderRadius: 8,
      maxWidth: 300,
      fontSize: 12,
      fontFamily: 'monospace'
    }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>Tweaks</div>
      {Object.entries(config).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>{key}</label>
          {typeof value === 'boolean' ? (
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
            />
          ) : typeof value === 'number' ? (
            <input
              type="range"
              min="0"
              max="100"
              value={value}
              onChange={(e) => onChange({ ...config, [key]: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          ) : value.startsWith('#') ? (
            <input
              type="color"
              value={value}
              onChange={(e) => onChange({ ...config, [key]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange({ ...config, [key]: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '4px 8px',
                color: '#fff',
                fontFamily: 'monospace'
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## Animation Timeline Engine

```jsx
const useTime = (duration = 5000) => {
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const frameRef = React.useRef();
  const startRef = React.useRef();

  React.useEffect(() => {
    if (!playing) return;
    
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) % duration;
      setTime(elapsed / duration); // 0 to 1
      frameRef.current = requestAnimationFrame(animate);
    };
    
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, duration]);

  return { time, playing, setPlaying };
};

const Easing = {
  linear: t => t,
  easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeIn: t => t * t * t,
  spring: t => 1 - Math.pow(Math.E, -6 * t) * Math.cos(8 * t)
};

const interpolate = (t, from, to, easing = Easing.easeInOut) => {
  const progress = easing(Math.max(0, Math.min(1, t)));
  return from + (to - from) * progress;
};

// Usage:
// const { time } = useTime(3000);
// const opacity = interpolate(time, 0, 1);
// const x = interpolate(time, -100, 0, Easing.spring);
```

---

## Design Canvas

For displaying multiple design options side by side:

```jsx
const DesignCanvas = ({ options, columns = 3 }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 24,
    padding: 24
  }}>
    {options.map((option, i) => (
      <div key={i}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 12,
          color: '#666'
        }}>
          Option {String.fromCharCode(65 + i)}: {option.label}
        </div>
        <div style={{
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          {option.content}
        </div>
      </div>
    ))}
  </div>
);
```

---

## Dark Mode Toggle

```jsx
const ThemeProvider = ({ children }) => {
  const [dark, setDark] = React.useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const theme = dark ? {
    bg: '#0a0a0b',
    surface: '#18181b',
    border: '#27272a',
    text: '#fafafa',
    textMuted: '#a1a1aa',
    primary: '#3b82f6'
  } : {
    bg: '#ffffff',
    surface: '#f4f4f5',
    border: '#e4e4e7',
    text: '#18181b',
    textMuted: '#71717a',
    primary: '#2563eb'
  };

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: '100vh' }}>
      <button
        onClick={() => setDark(!dark)}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          padding: '8px 16px',
          background: theme.surface,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        {dark ? '☀️' : '🌙'}
      </button>
      <div style={{ background: theme.bg, color: theme.text }}>
        {children}
      </div>
    </div>
  );
};
```

---

## Data Visualization Templates

### Chart.js Quick Start

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<canvas id="myChart" width="400" height="100"></canvas>

<script>
  const ctx = document.getElementById('myChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [{
        label: 'Sales',
        data: [12, 19, 3, 5, 2],
        borderColor: 'oklch(0.55 0.25 250)',
        backgroundColor: 'oklch(0.55 0.25 250 / 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'top' }
      }
    }
  });
</script>
```

---

## okLCH Color System

okLCH provides **perceptually uniform** colors. Same lightness values look the same brightness across all hues.

```css
:root {
  /* Define by hue once */
  --primary-h: 250;
  --secondary-h: 30;
  --accent-h: 200;
  
  /* Primary system */
  --primary: oklch(0.55 0.25 var(--primary-h));
  --primary-light: oklch(0.75 0.15 var(--primary-h));
  --primary-dark: oklch(0.35 0.2 var(--primary-h));
  
  /* Neutral grays (desaturated) */
  --gray-50: oklch(0.98 0.002 250);
  --gray-100: oklch(0.96 0.004 250);
  --gray-200: oklch(0.92 0.006 250);
  --gray-300: oklch(0.87 0.008 250);
  --gray-400: oklch(0.71 0.01 250);
  --gray-500: oklch(0.55 0.014 250);
  --gray-600: oklch(0.45 0.014 250);
  --gray-700: oklch(0.37 0.014 250);
  --gray-800: oklch(0.27 0.014 250);
  --gray-900: oklch(0.21 0.014 250);
}
```

**Why okLCH over HSL/RGB:**
- **L (Lightness)** is perceptually uniform—0.5 looks same brightness for blue, yellow, red
- **C (Chroma)** is perceptually uniform—controls saturation accurately
- **H (Hue)** is 0-360°—same as HSL, intuitive

---

## Font Stack Recommendations

```css
/* Modern, spacious */
font-family: 'Space Grotesk', 'Outfit', system-ui, sans-serif;

/* Elegant editorial */
font-family: 'Newsreader', 'Georgia', serif;

/* Premium corporate */
font-family: 'Sora', 'Outfit', system-ui, sans-serif;

/* Monospace for code */
font-family: 'JetBrains Mono', 'Monaco', monospace;
```

Load from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```
