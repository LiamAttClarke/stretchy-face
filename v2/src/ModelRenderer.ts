import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Mesh,
  Vector2,
  Raycaster,
  Intersection,
  Vector3,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhongMaterial,
  BoxBufferGeometry,
  MeshNormalMaterial,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as dat from "dat.gui";
import ElasticMesh, { ElasticMeshOptions } from "./ElasticMesh";

const MAX_PHYSICS_TICKS_PER_SECOND = 60;
const PHYSICS_TICK_DURATION_MS = 1000 / MAX_PHYSICS_TICKS_PER_SECOND;
const DEFAULT_ELASTICMESH_OPTIONS: ElasticMeshOptions = {
  particleMass: 0.1,
  stiffness: 0.4,
  originStiffness: 0.001,
  drag: 1,
  damping: 0.1,
  pinchRadius: 0.2,
};

export interface ModelRendererOptions {
  modelPath: string;
  renderTarget: Element;
}

export enum ModelRendererState {
  Paused,
  AwaitingFocus,
  Rendering,
}

const defaultOptions: Partial<ModelRendererOptions> = {
  renderTarget: document.body,
};

export default class ModelRenderer {
  public get state() {
    return this._state;
  }

  private _options: ModelRendererOptions;
  private _state: ModelRendererState = ModelRendererState.Paused;
  private _scene: Scene;
  private _camera: PerspectiveCamera;
  private _renderer: WebGLRenderer;
  private _physicsTimeout: NodeJS.Timeout = null;
  private _lastPhysicsUpdate: number = 0;
  private _animationRequestId: number|null = null;
  private _orbitControls: OrbitControls;
  private _elasticMesh: ElasticMesh|null = null;
  private _raycaster = new Raycaster();
  private _pointerIntersection: Intersection|null = null;
  private _meshControls = new dat.GUI({
    name: "Control Panel"
  });

  constructor(options: ModelRendererOptions) {
    this._options = { ...defaultOptions, ...options };
    this._scene = new Scene();
    this._camera = new PerspectiveCamera(
      35,
      this._options.renderTarget.clientWidth / this._options.renderTarget.clientHeight,
      0.1,
      1000,
    );
    this._camera.position.set(0, 0, 8);
    this._renderer = new WebGLRenderer();
    this._renderer.setSize(this._options.renderTarget.clientWidth, this._options.renderTarget.clientHeight);
    this._options.renderTarget.appendChild(this._renderer.domElement);
    // controls
    this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    this._orbitControls.listenToKeyEvents(document.body);
    this._orbitControls.enableDamping = true;
    this._orbitControls.dampingFactor = 0.1;
    this._orbitControls.screenSpacePanning = false;
    this._orbitControls.minDistance = 1;
    this._orbitControls.maxDistance = 10;
    this._orbitControls.maxPolarAngle = Math.PI;
  }

  public async initialize() {
    window.addEventListener("resize", this.onResizeEvent.bind(this));
    window.addEventListener("focus", this.onWindowFocus.bind(this));
    window.addEventListener("blur", this.onWindowBlur.bind(this));
    await this.initScene()
    this.initInput();
    this.initControlPanel();
  }

  public pause() {
    if (typeof this._animationRequestId == "number") {
      cancelAnimationFrame(this._animationRequestId);
    }
    if (this._physicsTimeout) {
      clearTimeout(this._physicsTimeout);
    }
    if (this._state != ModelRendererState.AwaitingFocus) {
      this._state = ModelRendererState.Paused;
    }
  }

  public resume() {
    this._state = ModelRendererState.Rendering;
    requestAnimationFrame(this.update.bind(this));
  }

  private async loadElasticMesh(modelPath: string): Promise<ElasticMesh> {
    const cubeSlices = 16;
    return new ElasticMesh(
      new BoxBufferGeometry(1, 1, 1, cubeSlices, cubeSlices, cubeSlices),
      new MeshNormalMaterial(),
      DEFAULT_ELASTICMESH_OPTIONS
    );
    const gltf = await new GLTFLoader().loadAsync(modelPath);
    let elasticMesh: ElasticMesh = null;
    gltf.scene.traverse((obj) => {
      if (elasticMesh) return;
      if (obj.type === "Mesh") {
        const originalMesh = obj as Mesh;
        originalMesh.geometry.computeVertexNormals();
        // elasticMesh = new ElasticMesh(originalMesh.geometry, new MeshNormalMaterial({ side: DoubleSide }), this.elasticMeshOptions);
        const originalMaterial: MeshBasicMaterial = (Array.isArray(originalMesh.material) ? originalMesh.material[0] : originalMesh.material) as MeshBasicMaterial;
        const material = new MeshPhongMaterial({
          map: originalMaterial.map,
          side: DoubleSide,
        })
        // const material = new MeshNormalMaterial();
        elasticMesh = new ElasticMesh(originalMesh.geometry, material, DEFAULT_ELASTICMESH_OPTIONS);
      }
    })
    return elasticMesh;
  }

  private async initScene() {
    // light
    const ambientLight = new AmbientLight(0xffffff, 0.8);
    const directionalLight = new DirectionalLight(0xffffff, 0.9);
    this._scene.add(ambientLight, directionalLight);
    // mesh
    this._elasticMesh = await this.loadElasticMesh(this._options.modelPath);
    this._scene.add(this._elasticMesh);
  }

  private initInput() {
    this._renderer.domElement.addEventListener("pointerdown", this.onPointerDown.bind(this));
    this._renderer.domElement.addEventListener("pointermove", this.onPointerMove.bind(this));
    this._renderer.domElement.addEventListener("pointerup", this.onPointerEnd.bind(this));
    this._renderer.domElement.addEventListener("cancel", this.onPointerEnd.bind(this));
  }

  private initControlPanel() {
    this._meshControls.add(this._elasticMesh, "particleMass", 0.1, 1, 0.1);
    this._meshControls.add(this._elasticMesh, "stiffness", 0, 1, 0.001);
    this._meshControls.add(this._elasticMesh, "originStiffness", 0, 0.25, 0.001);
    this._meshControls.add(this._elasticMesh, "drag", 0, 1, 1);
    this._meshControls.add(this._elasticMesh, "damping", 0, 0.5, 0.2);
    this._meshControls.add(this._elasticMesh, "pinchRadius", 0.01, 1, 0.01);
  }

  private update(updateTime: number) {
    const physicsTimeElapsedMS = updateTime - this._lastPhysicsUpdate;
    if (physicsTimeElapsedMS >= PHYSICS_TICK_DURATION_MS) {
      const physicsTickDuration = Math.min(physicsTimeElapsedMS, PHYSICS_TICK_DURATION_MS);
      this._elasticMesh.update(physicsTickDuration);
      this._lastPhysicsUpdate = updateTime;
    }
    // update camera orbit
    this._orbitControls.update();
    // render
    this._renderer.render(this._scene, this._camera);
    // loop
    this._animationRequestId = requestAnimationFrame(this.update.bind(this));
  }

  private onWindowFocus() {
    this.resume();
  }

  private onWindowBlur() {
    this._state = ModelRendererState.AwaitingFocus;
    this.pause();
  }

  private onPointerDown(event: PointerEvent) {
    const pointerScreenPosition = this.pointerToScreen(new Vector2(event.clientX, event.clientY));
    this._raycaster.setFromCamera(pointerScreenPosition, this._camera);
    this._pointerIntersection = this._raycaster
      .intersectObjects(this._scene.children, false)
      .find((i) => i.object.userData.elasticMesh);
    if (this._pointerIntersection) {
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (!this._pointerIntersection) return;
    event.preventDefault();
    event.stopPropagation();
    const elasticMesh = this._pointerIntersection.object as ElasticMesh;
    const pointerPosition = this.pointerToScreen(new Vector2(event.clientX, event.clientY));
    const pointerWorldPosition = this.screenToWorld(pointerPosition);
    const pointerDir = new Vector3().subVectors(pointerWorldPosition, this._camera.position).normalize();
    pointerWorldPosition.add(
      pointerDir.multiplyScalar(this._pointerIntersection.distance)
    );
    elasticMesh.stretch(
      this._pointerIntersection,
      pointerWorldPosition,
    );
  }

  private onPointerEnd(event: PointerEvent) {
    if (!this._pointerIntersection) return;
    this._pointerIntersection = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    event.preventDefault();
    this._elasticMesh.resetStretch();
  }

  private onResizeEvent() {
    const target = this._options.renderTarget;
    const rtWidth = target.clientWidth;
    const rtHeight = target.clientHeight;
    this._camera.aspect = rtWidth / rtHeight;
    this._renderer.setSize(rtWidth, rtHeight);
    this._camera.updateProjectionMatrix();
  }

  private pointerToScreen(pointerPosition: Vector2) {
    const renderTargetRect = this._options.renderTarget.getBoundingClientRect();
    return new Vector2(
      ((pointerPosition.x - renderTargetRect.left) / this._options.renderTarget.clientWidth) * 2 - 1,
      -(((pointerPosition.y - renderTargetRect.top) / this._options.renderTarget.clientHeight) * 2 - 1)
    );
  }

  private screenToWorld(screenPosition: Vector2): Vector3 {
    return new Vector3(screenPosition.x, screenPosition.y, -1).unproject(this._camera);
  }
}
