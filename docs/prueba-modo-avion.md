# Prueba en modo avión (T1.8)

Es la prueba de cierre de S3. Se hace en tu celular, con la app desplegada (HTTPS) e instalada como PWA. En el navegador de la PC no se puede probar del todo: ahí no se instala ni se mata la app como en el teléfono.

## Antes

- [ ] La app está desplegada (`docs/deploy.md`) y entraste una vez **con conexión**.
- [ ] Está **instalada**: Android, menú de Chrome → *Instalar app*; iOS, Safari → Compartir → *Agregar a inicio*.
- [ ] Abriste la app instalada (no la pestaña del navegador) y ves la sesión del día.
- [ ] Importaste la rutina y sincronizó: arriba no hay ningún aviso.

## En modo avión

1. [ ] Activá el modo avión **con la app cerrada** y abrila. Tiene que abrir directo en Hoy, sin pedir login. Arriba aparece "Sin conexión".
2. [ ] Tocá **Empezar**. Se abre la sesión.
3. [ ] Registrá 3 series del primer ejercicio:
   - una con un solo toque en la ficha de RIR;
   - otra ajustando el peso con + y después la ficha;
   - otra tocando el número, escribiendo el peso con el teclado y después la ficha.
   - El aviso de arriba cuenta los cambios guardados en el celular.
4. [ ] Editá una serie tocándola, y borrá otra y tocá **Deshacer**.
5. [ ] **Cerrá la app** desde el selector de apps (deslizándola), sin cerrar sesión.
6. [ ] **Matala del todo**:
   - Android: *Info de la app → Forzar detención*;
   - iOS: reiniciá el teléfono.
7. [ ] Abrila de nuevo, todavía en modo avión. Las series siguen ahí y la sesión se retoma con "Seguir la sesión".
8. [ ] Registrá una serie más.

## Al volver la conexión

9. [ ] Desactivá el modo avión con la app abierta. En unos segundos el aviso de arriba desaparece: se subió todo.
10. [ ] Desde la PC, mirá que estén en el servidor y que no haya duplicados (la cantidad tiene que coincidir con lo que registraste):
    ```bash
    ssh sv-gcg "cd /opt/production/app-fit && docker compose -f docker-compose.prod.yml exec -T db \
      psql -U appfit -d appfit -c \"select set_number, weight_kg, reps, rir, deleted_at is not null as borrada \
      from set_log order by logged_at desc limit 20\""
    ```

## iOS: lo que más puede fallar

- Safari puede borrar los datos de los sitios que no se usan durante días. La app pide almacenamiento persistente al arrancar, y la PWA instalada debería quedar exceptuada.
- Igual, la prueba que cuenta es la del punto 6: si después de reiniciar el teléfono las series no están, **avisá antes de usarla en el gimnasio**.

## Qué anotar

- Si algún paso falló, cuál y qué viste.
- Cuánto tardó en desaparecer el aviso al volver la conexión.
- El tiempo por serie: la app guarda `interaction_ms`, desde el primer toque sobre el panel hasta el toque que guarda. Hasta que la pantalla de estadísticas llegue en PR-30, la mediana sale así:
  ```sql
  select percentile_cont(0.5) within group (order by interaction_ms) / 1000.0 as mediana_s
  from set_log where interaction_ms is not null and deleted_at is null;
  ```
  La meta es 5 s o menos.
