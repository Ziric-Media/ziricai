/** Close notification drawer + shared backdrop (used by bell, ✕, Escape, navigation). */
export function closeNotificationDrawer() {
  document.getElementById('notificationDrawer')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('open');
}

export function dismissShellOverlays() {
  closeNotificationDrawer();
  document.getElementById('sidebar')?.classList.remove('open');
}
