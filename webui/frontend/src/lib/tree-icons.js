// Иконки дерева и боковой панели. Здесь перечислены именованные импорты, а не
// весь набор lucide: namespace-импорт (`import * as Icon`) не даёт сборщику
// выбросить неиспользуемые иконки, и в бандл уезжала вся библиотека.
import {
  AlertTriangle, Archive, BarChart, Beaker, BookOpen, Bookmark, Briefcase, Building,
  Calendar, ChevronRight, Clipboard, Code, FileText, Folder, FolderOpen, GraduationCap,
  Globe, Heart, Hash, Home, Inbox, LayoutTemplate, Lightbulb, Map, Puzzle, RefreshCw,
  Rocket, Settings, SlidersHorizontal, Star, Tag, Trash2, X,
} from 'lucide-svelte';

export const Icon = {
  AlertTriangle, Archive, BarChart, Beaker, BookOpen, Bookmark, Briefcase, Building,
  Calendar, ChevronRight, Clipboard, Code, FileText, Folder, FolderOpen, GraduationCap,
  Globe, Heart, Hash, Home, Inbox, LayoutTemplate, Lightbulb, Map, Puzzle, RefreshCw,
  Rocket, Settings, SlidersHorizontal, Star, Tag, Trash2, X,
};
