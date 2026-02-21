## 🧠 high-level overview

this is a **real-time multiplayer game**, so the backbone is:

* **websockets (authoritative server)**
* **room-based state management**
* **round-based game engine**
* **real-time drawing + chat sync**

---

![Image](https://svg.template.creately.com/hrwbhxhm2)

![Image](https://media.easy-peasy.ai/27feb2bb-aeb4-4a83-9fb6-8f3f2a15885e/8cee2376-a840-48b3-849f-b43f25306515_medium.webp)

![Image](https://substackcdn.com/image/fetch/f_auto%2Cq_auto%3Agood%2Cfl_progressive%3Asteep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F5634c993-d806-4857-881d-59efe68fb5e7_1616x1432.png)

---

## 1️⃣ user entry flow

### client

1. user opens site
2. prompted to **set username**

   * no auth for MVP
   * username validated (length, profanity, uniqueness in room)
3. client connects to WebSocket server
4. server assigns:

   * `socketId`
   * temporary `userId`

### server

* keeps:

```js
users[socketId] = {
  userId,
  username,
  roomId: null,
  score: 0
}
```

---

## 2️⃣ room lifecycle

### create room

* user clicks **Create Room**
* server:

  * generates `roomId` (short, shareable)
  * sets `maxPlayers = 5`
  * creator becomes **host**
  * initializes room state

```js
rooms[roomId] = {
  hostId,
  players: [],
  currentRound: 0,
  currentDrawer: null,
  word: null,
  phase: "waiting",
  timer: null,
  leaderboard: []
}
```

### join room

* user enters `roomId`
* server checks:

  * room exists
  * room not full
  * game not already finished
* user added to room
* broadcast updated player list

---

## 3️⃣ game start conditions (important)

game starts when:

* **minimum players** joined (e.g. 2)
* host clicks **Start Game** (recommended)

why this matters:

* avoids accidental auto-start
* allows people to join properly

---

## 4️⃣ round initialization flow

### round start

1. server increments `currentRound`
2. server selects **drawer**

   * random OR round-robin
3. server selects **word**

   * from dictionary
   * NOT sent to guessers
4. server sends:

   * drawer → full word
   * others → word length (`_ _ _ _`)
5. timer starts (e.g. 60s)

```js
phase = "drawing"
```

---

## 5️⃣ drawing sync (real-time)

### drawer

* sends drawing events:

```js
{
  type: "draw",
  x,
  y,
  color,
  strokeWidth
}
```

### server

* **does not store image**
* simply broadcasts draw events to others

### others

* replay strokes on canvas

⚠️ **missing piece you didn’t mention**
→ **canvas clear/reset at round start**

---

## 6️⃣ guessing flow (core logic)

### client

* users type guesses in chat
* guesses sent to server

### server

* case-insensitive match:

```js
guess.toLowerCase() === word.toLowerCase()
```

* once a user guesses correctly:

  * mark them as `guessed = true`
  * calculate score:

    * faster = more points
  * broadcast:

    * “X guessed the word!”
  * prevent further scoring for that user

### drawer scoring

* drawer also gets points:

  * based on number of correct guesses

⚠️ **missing piece**
→ prevent spamming guesses (rate-limit messages)

---

## 7️⃣ timer & round end

round ends when:

* timer hits 0 **OR**
* all players guessed correctly

server then:

1. reveals word to everyone
2. updates leaderboard
3. switches phase

```js
phase = "round_end"
```

---

## 8️⃣ leaderboard display

server sends:

```js
[
  { username, score },
  ...
]
```

client:

* shows leaderboard modal
* small delay (5–8 seconds)

⚠️ **important**
→ leaderboard should be **server-calculated only**

---

## 9️⃣ next round / game end

### next round

* repeat round init
* next drawer selected

### game end

after:

* fixed rounds (e.g. 3 per player)

server:

* final leaderboard
* winner announced
* options:

  * play again
  * leave room

---

## 🔍 things you were missing (very important)

### 1. disconnect handling

* if drawer disconnects:

  * skip round
  * pick next drawer
* if guesser disconnects:

  * remove from room
  * recalc end conditions

### 2. host migration

* if host leaves:

  * assign new host automatically

### 3. word security

* **never send word to guessers**
* validate guesses server-side only

### 4. anti-cheat basics

* no client-side scoring
* rate limit chat
* ignore guesses from drawer

### 5. late join rules

choose one:

* ❌ block joining mid-round
* ✅ allow but mute guessing until next round

---

## 🧩 recommended MVP tech stack (clean & simple)

* backend:

  * **Node.js / Bun**
  * **WebSocket (ws / socket.io)**
* frontend:

  * plain **HTML + CSS + JS**
  * `<canvas>` for drawing
* data:

  * in-memory (no DB for MVP)
* dictionary:

  * static JSON file

---

## 🧠 final mental model

think of your server as a **game referee**:

* clients → only send actions
* server → validates, decides, broadcasts
* server → owns truth

