// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsForm } from './SettingsForm';
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { patch }, ApiError: class ApiError extends Error {} }));
describe('settings form', () => {
  it('saves a typed setting', async () => {
    patch.mockResolvedValue({ data: { key: 'fees.graceDays', value: 4 } });
    render(<SettingsForm settings={[{ key: 'fees.graceDays', value: 10, default: 10 }]} />);
    fireEvent.change(screen.getByLabelText('grace Days'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save grace Days' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/settings/fees.graceDays', { value: 4 }));
  });
});

it('lets the owner edit multiple step-up actions before saving', () => {
  render(<SettingsForm settings={[{ key: 'identity.stepUp.actions', value: ['ROLE_CHANGE'], default: ['ROLE_CHANGE'] }]} />);
  const field = screen.getByLabelText('step Up · actions') as HTMLInputElement;
  fireEvent.change(field, { target: { value: 'ROLE_CHANGE, ' } });
  expect(field.value).toBe('ROLE_CHANGE, ');
});
