// @vitest-environment jsdom

import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, expect, test} from 'vitest'

import {Layout, Notice} from '../src/Layout'

afterEach(cleanup)

test('the notice links to the code that handles the password', () => {
  render(<Notice />)
  const link = screen.getByRole('link', {name: 'Read the code that handles your password'})
  expect(link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/shipth-is\/connect\/blob\/.+\/src\/srp\.ts$/)
})

test('"SRP proof values" links to the explainer', () => {
  render(<Notice />)
  expect(screen.getByRole('link', {name: 'SRP proof values'}).getAttribute('href')).toMatch(
    /^https:\/\/github\.com\/shipth-is\/connect\/blob\/.+\/docs\/how-it-works\.md$/,
  )
})

test('a build with no commit says so', () => {
  render(<Layout>hello</Layout>)
  expect(screen.getByText('dev build')).toBeTruthy()
  expect(screen.getByRole('link', {name: 'How to check this page'}).getAttribute('href')).toBe(
    'https://github.com/shipth-is/connect#how-to-check-this-page',
  )
})
