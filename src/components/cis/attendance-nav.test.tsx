import { render, screen } from '@testing-library/react';
import { AttendanceNav } from './attendance-nav';

let pathname = '/attendance';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
const day = '/attendance/b885f8bc-347d-4a99-82ea-d36bb1b35554';

it.each([true, false])('exposes labeled QR navigation for canManage=%s', (canManage) => {
  pathname = '/attendance';
  render(<AttendanceNav canManage={canManage} />);
  expect(screen.getByRole('link', { name: 'QR codes' })).toHaveAttribute('href', '/attendance/codes');
  expect(screen.queryByRole('link', { name: 'Teams' }) !== null).toBe(canManage);
});

it.each([
  ['/attendance', 'Days'],
  [day, 'Days'],
  [`${day}/codes`, 'QR codes'],
  ['/attendance/codes', 'QR codes'],
  ['/attendance/awards', 'Summary'],
  ['/attendance/archive', 'Archive'],
])('marks only the correct tab on %s', (path, label) => {
  pathname = path;
  render(<AttendanceNav canManage />);
  expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.textContent)).toEqual([label]);
});

it.each([day, `${day}/codes`])('keeps the selected roster when opening QR codes from %s', (path) => {
  pathname = path;
  render(<AttendanceNav canManage />);
  expect(screen.getByRole('link', { name: 'QR codes' })).toHaveAttribute('href', `${day}/codes`);
});
