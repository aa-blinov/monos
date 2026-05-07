import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');

editMode.subscribe(value => {
  localStorage.setItem('editMode', value);
});
