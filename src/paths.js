// Vite injects the deployment prefix, including its trailing slash.
export const publicPath = (path) => import.meta.env.BASE_URL.replace(/\/$/, '') + path
