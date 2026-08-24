import { test, expect, Page } from '@playwright/test';

/**
 * Sidebar App Shell E2E tests.
 *
 * Selector adaptation notes (verified against actual DOM, antd 5.29.3 / rc-drawer 7.3.0):
 * - Menu button: antd <Button icon={<MenuOutlined />}> renders a span with classes
 *   `anticon anticon-menu` inside the <button> → `button:has(.anticon-menu)` works.
 * - Drawer open state: rc-drawer toggles the class `ant-drawer-open` on the drawer root
 *   (NOT `.ant-drawer.open` as the plan assumed).
 * - Expanded tabs: Sidebar/index.tsx renders the 项目树/历史树 tabs as plain styled <div>s
 *   with inline styles — there is no `.expanded-tab` / `.active` CSS class. Tabs are located
 *   by exact text, and the active state is asserted via the inline border-bottom color
 *   #1a2744 → computed `rgb(26, 39, 68)` (inactive tab border is transparent).
 * - Settings panel: there is no `.settings-panel-open` class; SettingsPanel is an antd
 *   Drawer with title 「模型设置」, so we assert that drawer title becomes visible.
 */

/** #1a2744 — active tab inline border-bottom color */
const ACTIVE_TAB_BORDER = 'rgb(26, 39, 68)';
/** inactive tab border: 2px solid transparent */
const INACTIVE_TAB_BORDER = 'rgba(0, 0, 0, 0)';

function menuButton(page: Page) {
  return page.locator('button:has(.anticon-menu)');
}

test.describe('Sidebar App Shell', () => {
  test('opens sidebar when clicking menu button', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    // Drawer should slide in
    await expect(page.locator('.ant-drawer-open')).toBeVisible();
    // Should show "基础配置" section label
    await expect(page.getByText('基础配置')).toBeVisible();
    // Should show "管理会话" section label
    await expect(page.getByText('管理会话')).toBeVisible();
  });

  test('closes sidebar when clicking backdrop', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    await expect(page.locator('.ant-drawer-open')).toBeVisible();
    // Click outside sidebar (backdrop mask)
    await page.locator('.ant-drawer-mask').click();
    await expect(page.locator('.ant-drawer-open')).not.toBeVisible();
  });

  test('expands project-history section and switches tabs', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    // Click "项目树 / 历史树" nav row
    await page.getByText('项目树 / 历史树').click();
    // Should see expanded tab bar (tabs are plain divs, located by exact text)
    const treeTab = page.getByText('项目树', { exact: true });
    const historyTab = page.getByText('历史树', { exact: true });
    await expect(treeTab).toBeVisible();
    await expect(historyTab).toBeVisible();
    // Default tab (项目树) should be active
    await expect(treeTab).toHaveCSS('border-bottom-color', ACTIVE_TAB_BORDER);
    await expect(historyTab).toHaveCSS('border-bottom-color', INACTIVE_TAB_BORDER);
    // Switch to history tab
    await historyTab.click();
    await expect(historyTab).toHaveCSS('border-bottom-color', ACTIVE_TAB_BORDER);
    await expect(treeTab).toHaveCSS('border-bottom-color', INACTIVE_TAB_BORDER);
  });

  test('model config dialog opens when clicking 我的模型', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    await page.getByText('我的模型').click();
    // Existing SettingsPanel is an antd Drawer titled 「模型设置」
    await expect(page.getByText('模型设置')).toBeVisible();
  });

  test('unauthenticated state shows login prompt', async ({ page }) => {
    await page.goto('/');
    // Without login, sidebar identity row should show "未登录"
    await menuButton(page).click();
    await expect(page.getByText('未登录')).toBeVisible();
  });
});
