import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import SidebarMoreMenu from './SidebarMoreMenu.svelte';
import { locale, uiText } from '../lib/strings.js';

beforeEach(() => {
  locale.set('en');
});

test('«Прочее»: инструменты идут по порядку, корзина последней', async () => {
  const { component } = render(SidebarMoreMenu);
  const trash = vi.fn();
  component.$on('openTrash', trash);

  await fireEvent.click(screen.getByTestId('open-more'));

  const items = screen.getAllByRole('menuitem');
  expect(items.map((item) => item.textContent.trim())).toEqual([
    uiText.map.sidebar,
    uiText.favorites.sidebar,
    uiText.attachments.sidebar,
    uiText.sidebar.templates,
    uiText.sidebar.trash,
  ]);

  await fireEvent.click(screen.getByTestId('open-trash'));
  expect(trash).toHaveBeenCalledTimes(1);
});

test('на телефоне выбранный пункт закрывает боковую панель', async () => {
  const { component } = render(SidebarMoreMenu, { mobile: true });
  const picked = vi.fn();
  component.$on('picked', picked);

  await fireEvent.click(screen.getByTestId('open-more'));
  await fireEvent.click(screen.getByTestId('open-map'));

  expect(picked).toHaveBeenCalledTimes(1);
});
