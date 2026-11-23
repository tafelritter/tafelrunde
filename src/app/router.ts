// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { workspace } from './workspace/use-workspace'

/**
 * Hash-Modus: GitHub Pages kennt keinen SPA-Fallback, und Einladungsdaten im Fragment
 * erreichen nie einen Server.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/einrichten', name: 'setup', component: () => import('./views/SetupView.vue') },
    {
      path: '/b/:spaceId',
      name: 'space',
      component: () => import('./views/SpaceView.vue'),
      props: true,
    },
    {
      path: '/b/:spaceId/l/:listId',
      name: 'list',
      component: () => import('./views/ListView.vue'),
      props: true,
    },
    {
      path: '/plan',
      name: 'plan',
      component: () => import('./views/PlanView.vue'),
    },
    {
      path: '/rezepte',
      name: 'recipes',
      component: () => import('./views/RecipesView.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('./views/ImportView.vue'),
    },
    {
      path: '/katalog/:path+',
      name: 'catalog-recipe',
      component: () => import('./views/CatalogRecipeView.vue'),
      props: true,
    },
    {
      path: '/b/:spaceId/r/:recipeId',
      name: 'recipe',
      component: () => import('./views/RecipeView.vue'),
      props: true,
    },
    {
      path: '/b/:spaceId/r/:recipeId/bearbeiten',
      name: 'recipe-edit',
      component: () => import('./views/RecipeEditView.vue'),
      props: true,
    },
    {
      path: '/beitreten/:code',
      name: 'join',
      component: () => import('./views/JoinView.vue'),
      props: true,
    },
    {
      path: '/wiederherstellen/:code',
      name: 'recover',
      component: () => import('./views/JoinView.vue'),
      props: true,
    },
    {
      path: '/antwort/:code',
      name: 'reply',
      component: () => import('./views/ReplyView.vue'),
      props: true,
    },
    {
      path: '/komponenten',
      name: 'components',
      component: () => import('./views/ComponentsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/** Ohne Profil geht es zuerst zur Einrichtung; das Ziel (z. B. eine Einladung) bleibt erhalten. */
router.beforeEach(async (to) => {
  if (to.name === 'setup' || to.name === 'components') return true
  const ws = await workspace()
  if (ws.profile) return true
  return { name: 'setup', query: to.fullPath === '/' ? {} : { weiter: to.fullPath } }
})
