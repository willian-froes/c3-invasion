/* global AFRAME */
(() => {
  const ENGINE_URL =
    'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';
  const FRAME_WIDTH = 640;
  const FRAME_HEIGHT = 480;

  function withTimeout(promise, milliseconds, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  AFRAME.registerComponent('marker-weapon', {
    schema: {
      target: { default: 'assets/target.mind' },
      lostDelay: { default: 800 },
      markerWidth: { default: 0.1 },
      modelScale: { default: 0.7 },
      mountPoint: { type: 'vec3', default: { x: 0, y: 0.32, z: -0.18 } },
      mountRotation: { type: 'vec3', default: { x: 0, y: 180, z: 0 } },
      smoothing: { default: 60 },
    },
    init() {
      this.gun = document.querySelector('#held-gun');
      this.anchor = document.querySelector('#weapon-anchor');
      this.cameraEl = document.querySelector('#player-camera');
      this.widthInput = document.querySelector('#marker-width');
      this.scaleInput = document.querySelector('#weapon-scale');
      this.poseMatrix = new AFRAME.THREE.Matrix4();
      this.centerMatrix = new AFRAME.THREE.Matrix4();
      this.targetPosition = new AFRAME.THREE.Vector3();
      this.targetQuaternion = new AFRAME.THREE.Quaternion();
      this.poseScale = new AFRAME.THREE.Vector3();
      this.poseInitialized = false;
      this.video = document.querySelector('#camera-preview');
      this.button = document.querySelector('#camera-toggle');
      this.select = document.querySelector('#camera-select');
      this.status = document.querySelector('#marker-status');
      this.canvas = document.createElement('canvas');
      this.canvas.width = FRAME_WIDTH;
      this.canvas.height = FRAME_HEIGHT;
      this.context = this.canvas.getContext('2d');
      this.session = 0;
      this.active = false;
      this.found = false;
      this.engine = null;
      this.frameTask = Promise.resolve();
      this.onToggle = () => (this.active ? this.stop() : this.start());
      this.onCameraChange = () => {
        if (this.active) this.start();
      };
      this.onCalibrationChange = () => {
        if (
          !this.widthInput.reportValidity() ||
          !this.scaleInput.reportValidity()
        )
          return;
        const markerWidth = this.widthInput.valueAsNumber / 100;
        const modelScale = this.scaleInput.valueAsNumber;
        if (!(markerWidth > 0) || !(modelScale > 0)) return;
        this.el.setAttribute('marker-weapon', { markerWidth, modelScale });
      };
      this.onHidden = () => {
        if (document.hidden) this.stop();
      };
      this.onPageHide = () => this.stop();
      this.onGunError = () => {
        this.stop();
        this.status.textContent =
          'Não foi possível carregar a arma. Recarregue a página.';
      };
      this.button.addEventListener('click', this.onToggle);
      this.select.addEventListener('change', this.onCameraChange);
      this.widthInput.addEventListener('change', this.onCalibrationChange);
      this.scaleInput.addEventListener('change', this.onCalibrationChange);
      this.gun.addEventListener('model-error', this.onGunError);
      document.addEventListener('visibilitychange', this.onHidden);
      window.addEventListener('pagehide', this.onPageHide);
    },

    update() {
      const { mountPoint, mountRotation, modelScale } = this.data;
      const gun = this.gun.object3D;
      const radians = AFRAME.THREE.MathUtils.degToRad;
      gun.rotation.set(
        radians(mountRotation.x),
        radians(mountRotation.y),
        radians(mountRotation.z),
        'XYZ',
      );
      gun.scale.setScalar(modelScale);
      // Put the center of the printed image at the selected point on the model.
      // With a frontal upright marker, keep the weapon upright and its muzzle
      // pointing forward (-Z). The anchor still supplies the full tracked pose.
      gun.position
        .set(mountPoint.x, mountPoint.y, mountPoint.z)
        .multiplyScalar(-modelScale)
        .applyQuaternion(gun.quaternion);
      this.widthInput.value = this.data.markerWidth * 100;
      this.scaleInput.value = modelScale;
      if (this.pose && this.engine) this.updatePose(this.pose, true);
    },

    async loadEngine() {
      if (this.engine) return this.engine;
      if (!this.engineLoading) {
        this.engineLoading = (async () => {
          const [library, response] = await Promise.all([
            import(ENGINE_URL),
            fetch(this.data.target),
          ]);
          if (!response.ok)
            throw new Error('O arquivo do marcador não foi encontrado.');
          const buffer = await response.arrayBuffer();
          const engine = new library.Controller({
            inputWidth: FRAME_WIDTH,
            inputHeight: FRAME_HEIGHT,
            maxTrack: 1,
          });
          try {
            const { dimensions } = engine.addImageTargetsFromBuffer(buffer);
            if (dimensions.length !== 1)
              throw new Error('O arquivo do marcador é inválido.');
            this.targetDimensions = dimensions[0];
          } catch (error) {
            engine.worker.terminate();
            throw error;
          }
          this.engine = engine;
          return engine;
        })().finally(() => {
          this.engineLoading = null;
        });
      }
      return this.engineLoading;
    },

    async start() {
      this.stop(false);
      const session = this.session;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        this.status.textContent =
          'A câmera precisa de HTTPS no celular ou localhost no notebook.';
        return;
      }
      this.active = true;
      this.button.textContent = 'Cancelar';
      this.status.textContent =
        'Permita o acesso à câmera para reconhecer o marcador.';
      try {
        const deviceId = this.select.value;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: { ideal: 'environment' } }),
            width: { ideal: FRAME_WIDTH },
            height: { ideal: FRAME_HEIGHT },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        if (session !== this.session) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.stream = stream;
        this.video.srcObject = stream;
        this.video.hidden = false;
        await withTimeout(
          this.video.play(),
          15000,
          'A câmera não iniciou. Tente outra câmera.',
        );
        if (session !== this.session) return;
        stream.getVideoTracks()[0].addEventListener(
          'ended',
          () => {
            if (session !== this.session) return;
            this.stop();
            this.status.textContent =
              'A câmera foi desconectada. Conecte-a e ative novamente.';
          },
          { once: true },
        );
        this.refreshCameras(session);
        this.status.textContent = 'Preparando reconhecimento da imagem…';
        // One controller is reused across camera switches; wait for its last
        // worker request before starting another recognition loop.
        await this.frameTask;
        await withTimeout(
          this.loadEngine(),
          45000,
          'Não foi possível carregar o reconhecimento. Verifique a conexão e tente novamente.',
        );
        if (session !== this.session) return;
        this.button.textContent = 'Desligar câmera';
        this.hits = 0;
        this.pose = null;
        this.poseInitialized = false;
        this.lastSeen = 0;
        this.status.textContent =
          'Procurando marcador. Mostre a imagem inteira à câmera.';
        this.scheduleFrame(session);
      } catch (error) {
        if (session !== this.session) return;
        this.stop(false);
        const messages = {
          NotAllowedError:
            'Acesso à câmera negado. Libere a permissão no navegador e tente novamente.',
          NotFoundError:
            'Nenhuma câmera encontrada. Conecte uma webcam e tente novamente.',
          NotReadableError:
            'Câmera indisponível. Feche outros aplicativos que estejam usando a câmera.',
          OverconstrainedError:
            'Esta câmera não está disponível. Escolha outra câmera.',
        };
        this.status.textContent =
          messages[error.name] ||
          error.message ||
          'Não foi possível iniciar a câmera.';
      }
    },

    async refreshCameras(session) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (session !== this.session) return;
        const selected = this.stream.getVideoTracks()[0].getSettings().deviceId;
        this.select.replaceChildren(
          new Option('Automática (preferir traseira)', ''),
        );
        devices
          .filter((device) => device.kind === 'videoinput')
          .forEach((device, index) => {
            this.select.add(
              new Option(
                device.label || `Câmera ${index + 1}`,
                device.deviceId,
              ),
            );
          });
        if (
          [...this.select.options].some((option) => option.value === selected)
        )
          this.select.value = selected;
      } catch {
        // Automatic selection remains usable when device enumeration is restricted.
      }
    },

    scheduleFrame(session) {
      this.timer = setTimeout(() => {
        this.frameTask = this.processFrame(session).catch((error) => {
          this.engine?.worker.terminate();
          this.engine = null;
          if (session !== this.session) return;
          this.stop(false);
          this.status.textContent =
            'O reconhecimento foi interrompido. Ative a câmera para tentar novamente.';
          console.error('Reconhecimento do marcador:', error);
        });
      }, 33);
    },

    async processFrame(session) {
      if (session !== this.session || !this.active) return;
      const { videoWidth: width, videoHeight: height } = this.video;
      if (!width || !height || this.video.readyState < 2) {
        this.scheduleFrame(session);
        return;
      }
      // Preserve proportions for portrait phones, landscape phones and webcams.
      const scale = Math.min(FRAME_WIDTH / width, FRAME_HEIGHT / height);
      this.context.fillStyle = '#000';
      this.context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      this.context.drawImage(
        this.video,
        (FRAME_WIDTH - width * scale) / 2,
        (FRAME_HEIGHT - height * scale) / 2,
        width * scale,
        height * scale,
      );
      const recognize = async () => {
        if (this.pose) {
          const features = await this.engine.track(this.canvas, this.pose, 0);
          return this.engine.trackUpdate(this.pose, features);
        }
        const { featurePoints } = await this.engine.detect(this.canvas);
        const { modelViewTransform } = await this.engine.match(
          featurePoints,
          0,
        );
        return modelViewTransform;
      };
      const pose = await withTimeout(
        recognize(),
        15000,
        'O reconhecimento não respondeu.',
      );
      if (session !== this.session) return;
      this.pose = pose;
      if (pose) {
        this.hits++;
        this.lastSeen = performance.now();
        this.updatePose(pose);
        if (this.hits >= 2) this.setFound(true);
      } else {
        this.hits = 0;
        if (performance.now() - this.lastSeen > this.data.lostDelay)
          this.setFound(false);
      }
      this.scheduleFrame(session);
    },

    setFound(found) {
      if (this.found === found) return;
      this.found = found;
      this.anchor.setAttribute('visible', found);
      this.gun.setAttribute('visible', found);
      if (!found) this.poseInitialized = false;
      this.status.textContent = found
        ? 'Rastreando posição e inclinação da arma. Mantenha o marcador visível.'
        : 'Marcador perdido. Mostre a imagem novamente para equipar a arma.';
    },

    updatePose(pose, snap = false) {
      const [width, height] = this.targetDimensions;
      // MindAR returns a camera-relative OpenGL transform in target pixels,
      // with its origin at the image's lower-left corner. Center it, then
      // convert translation to meters using the actual printed image width.
      this.poseMatrix.fromArray(this.engine.getWorldMatrix(pose, 0));
      this.centerMatrix.makeTranslation(width / 2, height / 2, 0);
      this.poseMatrix.multiply(this.centerMatrix);
      this.poseMatrix.decompose(
        this.targetPosition,
        this.targetQuaternion,
        this.poseScale,
      );
      this.targetPosition.multiplyScalar(this.data.markerWidth / width);
      if (!this.poseInitialized || snap) {
        this.anchor.object3D.position.copy(this.targetPosition);
        this.anchor.object3D.quaternion.copy(this.targetQuaternion);
      }
      this.poseInitialized = true;
    },

    updateProjection() {
      if (
        !this.stream ||
        !this.engine ||
        !this.video.videoHeight ||
        !this.el.canvas
      )
        return;
      const camera = this.cameraEl.getObject3D('camera');
      if (!camera) return;
      if (this.savedFov === undefined)
        this.savedFov = this.cameraEl.getAttribute('camera').fov;
      const viewportWidth = this.el.canvas.clientWidth;
      const viewportHeight = this.el.canvas.clientHeight;
      if (!viewportWidth || !viewportHeight) return;
      const inputScale = Math.min(
        FRAME_WIDTH / this.video.videoWidth,
        FRAME_HEIGHT / this.video.videoHeight,
      );
      const displayScale = Math.max(
        viewportWidth / this.video.videoWidth,
        viewportHeight / this.video.videoHeight,
      );
      const focalLength =
        (this.engine.getProjectionMatrix()[5] * FRAME_HEIGHT) / 2;
      const fov = AFRAME.THREE.MathUtils.radToDeg(
        2 *
          Math.atan(
            viewportHeight / (((2 * focalLength) / inputScale) * displayScale),
          ),
      );
      // Keep the tracked pose aligned with the camera's field of view.
      if (Math.abs(camera.fov - fov) > 0.001)
        this.cameraEl.setAttribute('camera', 'fov', fov);
    },

    tick(time, delta) {
      this.updateProjection();
      if (this.poseInitialized && this.found) {
        const alpha =
          this.data.smoothing > 0
            ? 1 - Math.exp(-Math.min(delta || 0, 100) / this.data.smoothing)
            : 1;
        this.anchor.object3D.position.lerp(this.targetPosition, alpha);
        this.anchor.object3D.quaternion.slerp(this.targetQuaternion, alpha);
      }
    },

    stop(showMessage = true) {
      this.session++;
      this.active = false;
      clearTimeout(this.timer);
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.video.pause();
      this.video.srcObject = null;
      this.video.hidden = true;
      this.setFound(false);
      this.pose = null;
      this.poseInitialized = false;
      if (this.savedFov !== undefined) {
        this.cameraEl.setAttribute('camera', 'fov', this.savedFov);
        this.savedFov = undefined;
      }
      this.button.textContent = 'Ativar câmera';
      if (showMessage)
        this.status.textContent =
          'Câmera desligada. A arma aparece ao reconhecer o marcador.';
    },

    remove() {
      this.stop();
      this.button.removeEventListener('click', this.onToggle);
      this.select.removeEventListener('change', this.onCameraChange);
      this.gun.removeEventListener('model-error', this.onGunError);
      this.widthInput.removeEventListener('change', this.onCalibrationChange);
      this.scaleInput.removeEventListener('change', this.onCalibrationChange);
      document.removeEventListener('visibilitychange', this.onHidden);
      window.removeEventListener('pagehide', this.onPageHide);
      this.frameTask.finally(() => this.engine?.worker.terminate());
    },
  });
})();
