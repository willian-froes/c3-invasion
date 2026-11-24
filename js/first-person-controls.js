/* global AFRAME, C3Collision */
(() => {
  const { Vector3, Ray } = AFRAME.THREE;
  const { Capsule, Octree } = C3Collision;
  const MOVEMENT_KEYS = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
    'Space',
    'ShiftLeft',
    'ShiftRight',
  ]);
  const STEP = 1 / 120;

  AFRAME.registerComponent('first-person-controls', {
    schema: {
      world: { type: 'selector' },
      camera: { type: 'selector' },
      speed: { default: 4.2 },
      sprintSpeed: { default: 8.4 },
      radius: { default: 0.35 },
      height: { default: 1.8 },
      eyeHeight: { default: 1.65 },
      gravity: { default: 20 },
      jumpSpeed: { default: 7 },
      spawn: { type: 'vec3', default: { x: 0, y: 0, z: 50 } },
    },

    init() {
      this.keys = new Set();
      this.world = new Octree();
      this.collider = new Capsule();
      this.velocity = new Vector3();
      this.direction = new Vector3();
      this.forward = new Vector3();
      this.right = new Vector3();
      this.up = new Vector3(0, 1, 0);
      this.offset = new Vector3();
      this.groundRay = new Ray(new Vector3(), new Vector3(0, -1, 0));
      this.accumulator = 0;
      this.ready = false;
      this.grounded = false;
      this.status = document.querySelector('#movement-status');

      this.onKeyDown = (event) => {
        if (
          !MOVEMENT_KEYS.has(event.code) ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const target = event.target;
        if (
          target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName)
        )
          return;
        event.preventDefault();
        if (
          event.code === 'Space' &&
          !event.repeat &&
          !this.keys.has('Space') &&
          this.ready &&
          this.grounded
        ) {
          this.velocity.y = this.data.jumpSpeed;
          this.grounded = false;
        }
        this.keys.add(event.code);
      };
      this.onKeyUp = (event) => this.keys.delete(event.code);
      this.clearInput = () => this.keys.clear();
      this.onModelLoaded = () => this.buildWorld();
      this.onModelError = () => {
        this.ready = false;
        this.setStatus(
          'Não foi possível carregar o terreno. Recarregue a página.',
        );
      };
      this.data.world.addEventListener('model-loaded', this.onModelLoaded);
      this.data.world.addEventListener('model-error', this.onModelError);
      if (this.data.world.getObject3D('mesh')) this.buildWorld();
    },

    play() {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.clearInput);
      document.addEventListener('visibilitychange', this.clearInput);
      document.addEventListener('pointerlockchange', this.clearInput);
    },

    pause() {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.clearInput);
      document.removeEventListener('visibilitychange', this.clearInput);
      document.removeEventListener('pointerlockchange', this.clearInput);
      this.clearInput();
      this.accumulator = 0;
    },

    remove() {
      this.pause();
      this.data.world.removeEventListener('model-loaded', this.onModelLoaded);
      this.data.world.removeEventListener('model-error', this.onModelError);
      this.world.clear();
    },

    setStatus(message) {
      if (this.status) this.status.textContent = message;
    },

    buildWorld() {
      this.ready = false;
      try {
        this.world.clear();
        this.world.fromGraphNode(this.data.world.getObject3D('mesh'));
        this.respawn();
        this.ready = true;
        this.setStatus(
          'WASD / setas: caminhar · Shift: correr · Espaço: pular · Clique: olhar com o mouse · Esc: liberar cursor',
        );
      } catch (error) {
        this.setStatus(
          'Não foi possível preparar as colisões. Recarregue a página.',
        );
        console.error('Falha ao preparar o terreno:', error);
      }
    },

    respawn() {
      const { spawn, radius, height, eyeHeight } = this.data;
      // Find the actual surface near the entrance instead of assuming y = 0.
      this.groundRay.origin.set(spawn.x, spawn.y + 3, spawn.z);
      const ground = this.world.rayIntersect(this.groundRay);
      if (!ground) throw new Error('O ponto inicial está fora do terreno.');
      const feetY = ground.position.y + 0.02;
      this.collider.radius = radius;
      this.collider.start.set(spawn.x, feetY + radius, spawn.z);
      this.collider.end.set(spawn.x, feetY + height - radius, spawn.z);
      this.velocity.set(0, 0, 0);
      this.grounded = false;
      this.accumulator = 0;
      this.keys.clear();
      this.data.camera.object3D.position.set(0, eyeHeight, 0);
      this.syncPosition();
    },

    syncPosition() {
      this.el.object3D.position.copy(this.collider.start);
      this.el.object3D.position.y -= this.data.radius;
    },

    tick(time, delta) {
      if (!this.ready || !delta) return;
      const pressed = (a, b) => Number(this.keys.has(a) || this.keys.has(b));
      const forwardInput =
        pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown');
      const sideInput =
        pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft');

      // Use yaw only: looking up/down must never make the player fly.
      const yaw = this.data.camera.object3D.rotation.y;
      this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      this.right.crossVectors(this.forward, this.up);
      this.direction.copy(this.forward).multiplyScalar(forwardInput);
      this.direction.addScaledVector(this.right, sideInput).normalize();

      // Fixed short steps prevent tunneling through thin walls during slow frames.
      this.accumulator += Math.min(delta / 1000, 0.1);
      while (this.accumulator >= STEP) {
        this.step(STEP);
        this.accumulator -= STEP;
      }
      if (this.collider.start.y < -45) this.respawn();
      this.syncPosition();
    },

    step(delta) {
      const sprinting =
        this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = sprinting ? this.data.sprintSpeed : this.data.speed;
      this.velocity.x = this.direction.x * speed;
      this.velocity.z = this.direction.z * speed;
      this.velocity.y = Math.max(
        this.velocity.y - this.data.gravity * delta,
        -30,
      );
      this.collider.translate(
        this.offset.copy(this.velocity).multiplyScalar(delta),
      );

      // Resolve floor, walls and corners; remove velocity into the surface so
      // the capsule slides along obstacles instead of passing through them.
      this.grounded = false;
      for (let iteration = 0; iteration < 4; iteration++) {
        const hit = this.world.capsuleIntersect(this.collider);
        if (!hit || hit.depth < 1e-7) break;
        this.collider.translate(
          this.offset.copy(hit.normal).multiplyScalar(hit.depth + 1e-5),
        );
        // Only a walkable surface beneath a descending player allows jumping.
        if (hit.normal.y > 0.55 && this.velocity.y <= 0) this.grounded = true;
        const intoSurface = this.velocity.dot(hit.normal);
        if (intoSurface < 0)
          this.velocity.addScaledVector(hit.normal, -intoSurface);
      }
    },
  });
})();
