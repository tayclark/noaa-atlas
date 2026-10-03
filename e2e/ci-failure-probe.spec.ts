import { expect, test } from '@playwright/test'

test('temporary: fails on purpose to check the merged report (#273)', () => {
  expect(1).toBe(2)
})
