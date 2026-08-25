import { describe, expect, it } from 'vitest'

import { appLayoutForWidth } from './layout'

describe('appLayoutForWidth', () => {
  it('keeps compact and split-screen windows in the phone layout', () => {
    expect(appLayoutForWidth(767)).toEqual({
      isTablet: false,
      isWideTablet: false,
      isLargeTablet: false,
      navigationSidebarWidth: 0,
      gameSidebarWidth: 0,
      gameListColumns: 1,
    })
  })

  it('starts the tablet navigation at a bounded width', () => {
    expect(appLayoutForWidth(768)).toEqual({
      isTablet: true,
      isWideTablet: false,
      isLargeTablet: false,
      navigationSidebarWidth: 176,
      gameSidebarWidth: 0,
      gameListColumns: 2,
    })
  })

  it('grows both sidebars proportionally on wide tablets', () => {
    expect(appLayoutForWidth(1024)).toEqual({
      isTablet: true,
      isWideTablet: true,
      isLargeTablet: false,
      navigationSidebarWidth: 205,
      gameSidebarWidth: 320,
      gameListColumns: 2,
    })
  })

  it('uses three list columns and a wider utility sidebar on large tablets', () => {
    expect(appLayoutForWidth(1280)).toEqual({
      isTablet: true,
      isWideTablet: true,
      isLargeTablet: true,
      navigationSidebarWidth: 240,
      gameSidebarWidth: 384,
      gameListColumns: 3,
    })
  })

  it('caps sidebars on desktop-sized windows', () => {
    expect(appLayoutForWidth(1800)).toMatchObject({
      navigationSidebarWidth: 240,
      gameSidebarWidth: 440,
      gameListColumns: 3,
    })
  })
})
