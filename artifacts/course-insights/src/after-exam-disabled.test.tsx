import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('temporarily disabled After the exam section', () => {
  it.each(['/after-exam', '/after-exam/', '/after-exam?professor=example', '/after-exam/anything'])('does not expose the feedback page at %s', (path) => {
    window.history.replaceState(null, '', path);
    render(<App />);
    expect(screen.getByRole('heading', { name: '404 Page Not Found' })).toBeTruthy();
    expect(screen.queryByTestId('form-exam-feedback')).toBeNull();
    expect(screen.queryByRole('link', { name: 'After the exam' })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' }))
      .getAllByRole('link').map((link) => link.textContent)).toEqual(['Overview', 'Professors', 'Courses']);
    expect(screen.getByRole('link', { name: 'How scores are calculated' })).toBeTruthy();
  });
});
