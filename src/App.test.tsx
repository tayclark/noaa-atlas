// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('App', () => {
  it('renders the heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeTruthy()
  })

  it('increments the counter when the button is clicked', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /count is/i })
    expect(button.textContent).toBe('Count is 0')
    fireEvent.click(button)
    expect(button.textContent).toBe('Count is 1')
  })
})
