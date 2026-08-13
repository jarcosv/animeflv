# Publicacion automatica en paginas de Facebook

Al guardar un episodio nuevo con visibilidad `published`, el panel llama a
`/api/facebook-post`. La funcion publica el enlace en todas las paginas
configuradas y deja preparada, por separado, la distribucion manual a grupos.

## Variables de entorno en Vercel

Configura `SUPABASE_URL`, `SUPABASE_KEY` y `FACEBOOK_API_VERSION` (`v25.0`).

Para una o varias paginas, agrega `FACEBOOK_PAGES_JSON` en una sola linea:

```json
[{"name":"Pagina principal","page_id":"123456789","access_token":"TOKEN_PAGINA_1"},{"name":"Segunda pagina","page_id":"987654321","access_token":"TOKEN_PAGINA_2"}]
```

No guardes los tokens en Git ni en archivos publicos. Cada token debe ser un
Page Access Token de la pagina correspondiente. La app de Meta debe contar con
los permisos necesarios para listar y publicar en las paginas administradas,
incluidos `pages_show_list`, `pages_read_engagement` y `pages_manage_posts`.

La configuracion antigua con `FACEBOOK_PAGE_ID` y
`FACEBOOK_PAGE_ACCESS_TOKEN` sigue funcionando cuando no existe
`FACEBOOK_PAGES_JSON`.

Despues de cambiar variables de entorno, vuelve a desplegar el proyecto. Haz la
primera prueba con un episodio nuevo real; editar un episodio existente no
vuelve a publicarlo. Las importaciones masivas tampoco publican automaticamente
para evitar spam accidental.
