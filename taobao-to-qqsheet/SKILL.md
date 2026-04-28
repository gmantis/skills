---
name: taobao-to-qqsheet
description: Fill Taobao purchase order details into a QQ Docs shipping packing list spreadsheet. Triggers on "fill taobao orders", "taobao to qq sheet", "fill shipping list", "fill packing list", "taobao shipping form", "fill qq form from taobao".
---

# Taobao to QQ Docs Shipping Packing List

Fill purchased item details from Taobao into a QQ Docs (腾讯文档) shipping packing list spreadsheet. This skill uses Playwright browser automation to navigate both sites, extract order data from Taobao, and enter it into the correct section of the QQ Docs spreadsheet.

## Prerequisites

- Playwright MCP server must be running
- User must have WeChat for QQ Docs login (QR scan)
- User must have Taobao app for Taobao login (QR scan)

## Key URLs

- **QQ Docs spreadsheet**: `https://docs.qq.com/sheet/DTVVFUmhNeGdyR2JU?tab=i3urug`
- **Taobao purchases**: `https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm`
- **Taobao login**: `https://login.taobao.com/`

## Spreadsheet Structure

The spreadsheet is named "WZ19海运拼团装箱清单" (Packing List). Each sheet tab represents a shipping batch (海运85, 海运86, ..., 海运92).

### Columns (Row 10 is the header row):

| Column | Header | Description |
|--------|--------|-------------|
| A | 客户名 | Customer name (e.g. "Lolland") — only in the first row of a customer's section |
| B | Description (货物品名) | Item description — MUST be vague (see rules below) |
| C | Express Company (快递公司) | Courier name: 顺丰, 圆通, 中通, 申通, 京东, etc. |
| D | Tracking No. (快递单号) | Courier tracking number |
| E | Quantity (CTNS) (箱数) | Number of packages, usually 1 |
| F | Total Value (总价值RMB) | Price = 实付金额 / 5 |

### Item Description Rules (CRITICAL)

- **ALWAYS use vague, generic descriptions**. Examples: 日用品, 电子产品, 玩具, 餐具, 厨房用品, 文具, 服装, 鞋类, 家居用品, 装饰品
- **NEVER mention**: 药品 (medicine), 血糖仪 (glucose monitor), 肉类 (meat), 食品 (food), or any item that could be flagged as prohibited for international shipping
- Medical devices → 电子产品
- Food covers / kitchen items → 日用品 or 厨房用品
- Health supplements → 日用品
- Books → 文具

### Price Calculation

**Total Value = 实付金额 (actual paid amount) / 5**

Examples:
- 实付金额 ¥1105.00 → Total Value = ¥221.00
- 实付金额 ¥23.80 → Total Value = ¥4.76

## Workflow

### Step 1 — Open QQ Docs Spreadsheet and Login

1. Navigate to the spreadsheet URL
2. The document will open in "View only" mode
3. Click "Login 腾讯文档" button (top right)
4. A login dialog appears with WeChat / QQ / WeCom options
5. Click "Log in now" for WeChat — a Service Agreement dialog may appear
   - The "Agree" button may be blocked by a modal overlay. Use JavaScript to click it:
     ```js
     document.querySelectorAll('button').forEach(b => { if (b.textContent.trim() === 'Agree') b.click(); });
     ```
6. A WeChat QR code appears — **ask user to scan with WeChat app**
7. Wait for user confirmation, then verify login succeeded (toolbar buttons become enabled, "View only" badge disappears)

### Step 2 — Find the First Unlocked Tab

1. Look at the sheet tabs at the bottom of the spreadsheet (海运85 through 海运92)
2. **Locked tabs have a lock icon (🔒) visible on the tab** — unlocked tabs do not
3. Click the first tab WITHOUT a lock icon
4. Currently, 海运89 is typically the first unlocked tab (tabs 85-88 are locked)

### Step 3 — Find or Create the "Lolland" Section

1. Use **Ctrl+F** to open the search dialog in QQ Docs
2. Type "lolland" in the search box (textbox with placeholder "输入查找内容") and press Enter
3. If found: note the row number. New items go in the rows immediately after the last Lolland entry
4. If not found: scroll to the end of existing data and create a new section with "Lolland" in column A

### Step 4 — Login to Taobao

1. Navigate directly to `https://login.taobao.com/` — do NOT try to login from the taobao.com homepage because the login form is in a cross-origin iframe that cannot be accessed
2. The login page shows a QR code on the left ("手机扫码登录")
3. **Ask user to scan with Taobao app**
4. Wait for user confirmation
5. After login, dismiss any popups:
   - Coupon popup (超级88消费券): find and click the close button
     ```js
     document.querySelector('[class*="close"], [class*="Close"]').click();
     ```
   - Notification subscription (订阅淘宝通知): click "取消"
     ```js
     document.querySelectorAll('button, div, span').forEach(el => { if (el.textContent.trim() === '取消') el.click(); });
     ```

### Step 5 — Navigate to Purchase History

1. Click "已买到的宝贝" link in the sidebar or top navigation
   ```js
   document.querySelectorAll('a').forEach(a => { if (a.textContent.includes('已买到的宝贝')) a.click(); });
   ```
2. The URL should be: `https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm`
3. Dismiss the "新增订单导出功能" tooltip if it appears:
   ```js
   document.querySelectorAll('*').forEach(el => { if (el.textContent.trim() === '知道了') el.click(); });
   ```

### Step 6 — Identify Which Orders to Fill

1. Compare the orders on Taobao with what's already in the QQ spreadsheet under Lolland
2. Only fill orders that are NOT already in the spreadsheet
3. Match by tracking number (column D) to avoid duplicates
4. Ask the user which orders to fill if unclear, or fill only new/unfilled ones

### Step 7 — Get Order Details (Tracking Info)

**IMPORTANT**: The "导出订单" (Export Orders) feature does NOT include tracking numbers for completed orders. You MUST get tracking info from individual order detail pages.

1. For each order that needs to be filled, click "订单详情" (Order Details) link
   ```js
   document.querySelector('a[href*="ORDER_ID"]').click();
   ```
2. The order detail page opens in a new tab — switch to it using `browser_tabs(action: "select", index: N)`
3. On the order detail page, find:
   - **Express Company**: shown as icon + text, e.g. "顺丰速运 SF5193257144411" or "中通快递 78991989969590"
   - **Tracking Number**: the alphanumeric code next to the courier name
   - The shipping address line should contain "LWZ19-SG(lolland)" confirming it's the right recipient
4. Record the courier name (shortened: 顺丰速运→顺丰, 中通快递→中通, 圆通速递→圆通, 申通快递→申通, 京东物流→京东) and tracking number
5. Switch back to the orders tab or QQ Docs tab as needed

### Step 8 — Fill Data into QQ Docs Spreadsheet

#### Critical QQ Docs Interaction Rules

**ALWAYS use this two-step process to fill any cell:**

1. **Name box** — use to navigate to the target cell
   - The name box is a `textbox` inside `#mainContainer` (NOT the formula bar)
   - Fill it with the cell reference (e.g. "B95") and press Enter
   - This selects the target cell

2. **Formula bar** — use to type the cell value
   - The formula bar is `#alloy-simple-text-editor` (a combobox/paragraph element)
   - Click it first, then use `fill()` to set the value, then press Enter to confirm
   - The Playwright locator is: `page.locator('#alloy-simple-text-editor').getByRole('paragraph')`

**NEVER:**
- Try to type directly into cells (won't work)
- Use `pressSequentially` for Chinese characters (IME won't work)
- Confuse the name box with the formula bar — they are different elements
- Put cell references (like "C95") into the formula bar — that goes in the name box

**To delete cell content:**
- Navigate to the cell using the name box
- Press the `Delete` key
- Or: select the cells, highlight them, and press Delete

#### Filling Sequence

For each new order, fill cells in this order:
1. **B** (货物品名) — vague description
2. **C** (快递公司) — courier name
3. **D** (快递单号) — tracking number
4. **E** (数量) — quantity (usually "1")
5. **F** (总价值) — calculated price with ¥ prefix (e.g. "¥221.00")

Only put the customer name "Lolland" in column A for the FIRST row of a new Lolland section. If Lolland already exists, leave column A empty for additional rows.

#### CRITICAL: Only Edit the Lolland Section

- **NEVER** modify cells belonging to other customers' sections
- Only add/edit rows within the Lolland section (between Lolland's first row and the next customer's section or end of data)
- Always verify you are in the correct row range before typing

#### Inserting New Rows if No Space

If there are no empty rows available below the last Lolland entry (i.e. another customer's section starts immediately after), you MUST insert new rows before filling data:

1. Navigate to the last row of the Lolland section using the name box
2. Click on the row to select it
3. Go to the toolbar menu: **插入** (Insert) → **行列** (Rows & Columns) → **在下方插入一行** (Insert 1 row below)
4. Repeat if you need multiple rows
5. Then fill the newly inserted empty rows with data

This ensures you never overwrite another customer's data.

#### Example Fill Sequence (cell B95):

```
# Step 1: Navigate to cell using name box
browser_type(ref=NAME_BOX_REF, text="B95", submit=true)

# Step 2: Click formula bar
browser_click(ref=FORMULA_BAR_REF)  # or click #alloy-simple-text-editor paragraph

# Step 3: Type value in formula bar and confirm
browser_type(ref=FORMULA_BAR_REF, text="电子产品", submit=true)
```

### Step 9 — Verify

1. Navigate to the Lolland section (use name box to go to the first Lolland row)
2. Take a screenshot to verify all data is correctly filled
3. Check that:
   - Descriptions are vague and safe
   - Tracking numbers match the order details
   - Prices are correctly calculated (实付金额 / 5)
   - No stray data in other cells

## Element Reference Quick Guide

These element references may change between sessions. Always take a snapshot to get current refs.

| Element | How to find | Locator hint |
|---------|-------------|--------------|
| Name box | textbox inside `#mainContainer` area, shows cell ref like "A1" | `page.locator('#mainContainer').getByRole('textbox')` |
| Formula bar | combobox/paragraph in `#alloy-simple-text-editor` | `page.locator('#alloy-simple-text-editor').getByRole('paragraph')` |
| Sheet tabs | tablist "工作表" at the bottom status bar | tab elements with names like "海运89" |
| Search box | textbox with placeholder "输入查找内容" (after Ctrl+F) | role textbox with name "输入查找内容" |

## Troubleshooting

### QQ Docs "Agree" button blocked by modal overlay
Use JavaScript evaluate to click through the overlay:
```js
document.querySelectorAll('button').forEach(b => { if (b.textContent.trim() === 'Agree') b.click(); });
```

### Taobao login iframe is cross-origin
Do NOT try to interact with the login form on taobao.com homepage. Navigate directly to `https://login.taobao.com/` instead.

### Chinese text won't type into QQ Docs cells
Never use `pressSequentially` for Chinese text. Always use `fill()` on the formula bar element, which sets the value directly.

### Clipboard paste works but is unreliable
While `navigator.clipboard.writeText()` + Ctrl+V works sometimes, the formula bar `fill()` + Enter approach is more reliable and should be preferred.

### Snapshot too large
QQ Docs and Taobao pages can produce very large snapshots. Use `grep` on the snapshot file to find specific elements rather than reading the full snapshot.

### Tab switching
When order details open in a new tab, use `browser_tabs(action: "select", index: N)` to switch between:
- Tab 0: Taobao orders list
- Tab 1: QQ Docs spreadsheet
- Tab 2+: Individual order detail pages

## Complete Example

Filling two orders for Lolland in rows 95-96:

| Field | Order 1 (Row 95) | Order 2 (Row 96) |
|-------|-------------------|-------------------|
| 货物品名 | 电子产品 | 日用品 |
| 快递公司 | 顺丰 | 中通 |
| 快递单号 | SF5193257144411 | 78991989969590 |
| 数量 | 1 | 1 |
| 总价值 | ¥221.00 (1105/5) | ¥4.76 (23.80/5) |
