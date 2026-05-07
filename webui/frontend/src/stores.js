import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');
export const syncScroll = writable(true);

editMode.subscribe(value => {
  localStorage.setItem('editMode', value);
});
