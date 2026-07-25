bash fabric/network/scripts/teardown.sh   # elimina la red vieja
bash fabric/network/scripts/setup.sh      # la crea de nuevo


recrear.
cd fabric\network
docker compose up -d --force-recreate
docker ps    # deben aparecer los 7



 Nunca uses docker compose down -v — la -v borra los volúmenes y ahí sí pierdes toda la cadena.


 C:\Users\Usuario\Desktop\block>node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
ci923/5CEKhn5pYRtjQDwtPXIdnUmi4XjRhqrIAo6L2q0o1Yam6B2Q9A8CweieKB

C:\Users\Usuario\Desktop\block>


npm run db:reset





ccorre 
 docker ps

 teardown.sh = DESTRUYE todo. Es lo que corriste antes y por eso te quedó solo n8n. Borra contenedores, volúmenes (el ledger) y el material criptográfico.
setup.sh = CONSTRUYE todo de nuevo. Es lo que yo ejecuté hace un momento por ti, y por eso ahora ves todo arriba otra vez.

MANULMTE IF RESTART
cd C:/Users/Usuario/Desktop/block/fabric/network && docker compose up -d



[
       83,  85,  67,  67,  69,  83,  83,  58,  32,  84, 104, 101,
       32, 112, 114, 111,  99, 101, 115, 115,  32, 119, 105, 116,
      104,  32,  80,  73,  68,  32,  49,  49,  51,  48,  56,  32,
       40,  99, 104, 105, 108, 100,  32, 112, 114, 111,  99, 101,
      115, 115,  32, 111, 102,  32,  80,  73,  68,  32,  50,  48,
       56,  53,  50,  41,  32, 104,  97, 115,  32,  98, 101, 101,
      110,  32, 116, 101, 114, 109, 105, 110,  97, 116, 101, 100,
       46,  13,  10,  83,  85,  67,  67,  69,  83,  83,  58,  32,
       84, 104, 101,  32,
      ... 74 more items
    ]

    C:\Users\Usuario\Desktop\block\backend>
  npm run start:dev