# Pruebas — módulos de notificaciones e IA

Carpeta dedicada con pruebas **unitarias** y de **integración** para las
funcionalidades de notificaciones push (FCM) y detección de anomalías (IA).

## Estructura

```
test/evoting/
├── unit/                          # Pruebas unitarias (lógica aislada, con mocks)
│   ├── notifications.service.spec.ts
│   └── anomaly.service.spec.ts
├── integration/                   # Pruebas de integración (rutas HTTP con supertest)
│   ├── ai.int-spec.ts
│   └── notifications.int-spec.ts
└── jest.config.json
```

- **Unitarias**: prueban la lógica de un servicio de forma aislada, reemplazando
  sus dependencias (base de datos, configuración, axios) por mocks. Rápidas y sin
  I/O real.
- **Integración**: levantan el controlador real con `@nestjs/testing` y hacen
  peticiones HTTP con `supertest`, verificando routing, códigos de estado,
  validación de DTOs y cuerpo de respuesta. Los servicios y guards se simulan.

## Cómo ejecutarlas

```bash
cd backend
npm run test:evoting
```

O directamente con Jest:

```bash
npx jest --config ./test/evoting/jest.config.json
```

## Qué cubren

| Archivo | Casos |
|---|---|
| `notifications.service.spec.ts` | Instanciación, degradación segura sin Firebase, upsert de token, plataforma, no-op y tolerancia a fallos de la notificación de voto. |
| `anomaly.service.spec.ts` | Consulta de estado, detección con `electionId`, entrenamiento, y mapeo de errores 503/409/conexión a excepciones de Nest. |
| `ai.int-spec.ts` | `GET /ai/status`, `POST /ai/train`, `GET /ai/anomalies` (con y sin `electionId`). |
| `notifications.int-spec.ts` | `POST /dispositivos` (registro, plataforma por defecto, validación de token y de plataforma). |
