const { test, expect } = require('@playwright/test');

test('choosing microphone mute clears its unused toggle fields', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.addInitScript(() => localStorage.setItem('pb-demo-config', JSON.stringify({
    night: { enabled: false }, rules: [],
    shortcuts: [{ id: 'mic', label: 'Microphones', cmd: 'demo', toggle: true, stateKey: 'mute-state', offCmd: 'unmute.exe', offArgs: '--mic' }],
    pages: [],
  })));
  await page.goto('/settings/#shortcuts');

  const command = page.locator('section.on .field').filter({ hasText: 'Command' }).locator('input').first();
  await expect(command).toHaveValue('demo');
  await command.fill('builtin:mic-mute');
  await expect.poll(() => page.evaluate(() => cfg.shortcuts[0])).toMatchObject({
    id: 'mic', cmd: 'builtin:mic-mute', toggle: true,
  });
  expect(await page.evaluate(() => ['stateKey', 'offCmd', 'offArgs'].filter((key) => key in cfg.shortcuts[0]))).toEqual([]);

  await page.evaluate(() => Object.assign(cfg.shortcuts[0], { stateKey: 'keep-state', offCmd: 'keep.exe', offArgs: '--keep' }));
  await command.fill('another-command');
  await expect.poll(() => page.evaluate(() => cfg.shortcuts[0])).toMatchObject({
    cmd: 'another-command', stateKey: 'keep-state', offCmd: 'keep.exe', offArgs: '--keep',
  });

  const preset = page.locator('section.on .field').filter({ hasText: 'Command' }).locator('select');
  await preset.selectOption('builtin:mic-mute');
  await expect.poll(() => page.evaluate(() => cfg.shortcuts[0].cmd)).toBe('builtin:mic-mute');
  expect(await page.evaluate(() => ['stateKey', 'offCmd', 'offArgs'].filter((key) => key in cfg.shortcuts[0]))).toEqual([]);
});

test('the demo microphone shortcut toggles input devices without changing output devices', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pb-demo-config', JSON.stringify({
    night: { enabled: false }, rules: [],
    shortcuts: [{ id: 'mic', label: 'Microphones', cmd: 'builtin:mic-mute', toggle: true }],
    pages: [],
  })));
  await page.goto('/panel/');

  const result = await page.evaluate(async () => {
    const read = async (url) => (await fetch(url)).json();
    const before = await read('/api/controls/state');
    await fetch('/api/run/mic', { method: 'POST' });
    const afterFirst = await read('/api/controls/state');
    const firstToggle = (await read('/api/state')).toggles.mic;
    await fetch('/api/run/mic', { method: 'POST' });
    const afterSecond = await read('/api/controls/state');
    const secondToggle = (await read('/api/state')).toggles.mic;
    const devices = (state) => state.audio.devices.map(({ id, direction, muted }) => ({ id, direction, muted }));
    return {
      before: devices(before), afterFirst: devices(afterFirst), afterSecond: devices(afterSecond),
      firstToggle, secondToggle,
    };
  });

  const beforeOutputs = result.before.filter((device) => device.direction === 'output');
  expect(result.afterFirst.filter((device) => device.direction === 'output')).toEqual(beforeOutputs);
  expect(result.afterSecond.filter((device) => device.direction === 'output')).toEqual(beforeOutputs);
  expect(result.afterFirst.find((device) => device.direction === 'input').muted).toBe(false);
  expect(result.afterSecond.find((device) => device.direction === 'input').muted).toBe(true);
  expect(result.firstToggle).toBe(false);
  expect(result.secondToggle).toBe(true);
});
