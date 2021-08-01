import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Mesh,
  BoxBufferGeometry,
  Vector2,
  Raycaster,
  Intersection,
  MeshNormalMaterial,
  Vector3,
  SphereBufferGeometry,
  IcosahedronBufferGeometry,
  MeshPhongMaterial,
  TextureLoader,
  MeshBasicMaterial,
  Side,
  DoubleSide,
  Quaternion,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import ElasticMesh from './ElasticMesh';

const MODEL_PATH = '/assets/liam.glb';
const TEXTURE_PATH = '/assets/liam_texture.png';
const MAX_FPS = 60;

export interface ModelRendererOptions {
  renderTarget: Element,
}

const defaultOptions: Partial<ModelRendererOptions> = {
  renderTarget: document.body,
};

export default class ModelRenderer {
  private options: ModelRendererOptions;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private orbitControls: OrbitControls;
  private elasticMesh: ElasticMesh|null = null;
  private lastUpdateTimeMS: number = 0;
  private lastPointerPosition: Vector2 = new Vector2();
  private pointerStartPosition: Vector2 = new Vector2();
  private raycaster = new Raycaster();
  private raycastIntersection: Intersection|null = null;

  constructor(options: ModelRendererOptions) {
    this.options = { ...defaultOptions, ...options };
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      35,
      this.options.renderTarget.clientWidth / this.options.renderTarget.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 8);
    this.renderer = new WebGLRenderer();
    this.renderer.setSize(this.options.renderTarget.clientWidth, this.options.renderTarget.clientHeight);
    this.options.renderTarget.appendChild(this.renderer.domElement);
    // controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.listenToKeyEvents(document.body);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;
    this.orbitControls.screenSpacePanning = false;
    // this.orbitControls.autoRotateSpeed = 10;
    // this.orbitControls.autoRotate = true;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 10;
    this.orbitControls.maxPolarAngle = Math.PI;

    window.addEventListener('resize', this.onResizeEvent.bind(this));

    this.initScene().then(() => {
      this.initInput();
      this.update(performance.now());
    });
  }

  private async loadElasticMesh(modelPath: string, texturePath: string): Promise<ElasticMesh> {
    const texture = await new TextureLoader().loadAsync(texturePath);
    texture.flipY = false;
    const material = new MeshBasicMaterial({
      map: texture,
      side: DoubleSide
    });
    const gltf = await new GLTFLoader().loadAsync(modelPath);
    let elasticMesh: ElasticMesh = null;
    gltf.scene.traverse((obj) => {
      if (obj.type === 'Mesh') {
        const originalMesh = obj as Mesh;
        originalMesh.geometry.computeVertexNormals();
        elasticMesh = new ElasticMesh(new BoxBufferGeometry(1, 1, 1, 32, 32, 32), new MeshNormalMaterial());
        // elasticMesh = new ElasticMesh(new SphereBufferGeometry(1, 32, 32), new MeshNormalMaterial());
        // elasticMesh = new ElasticMesh(originalMesh.geometry, material);
      }
    })
    // mesh.material = material;
    return elasticMesh;
  }

  private async initScene() {
    // light
    const ambientLight = new AmbientLight(0xffffff);
    const directionalLight = new DirectionalLight(0xffffff, 0.1);
    this.scene.add(ambientLight, directionalLight);
    // mesh
    this.elasticMesh = await this.loadElasticMesh(MODEL_PATH, TEXTURE_PATH);
    this.scene.add(this.elasticMesh);
  }

  private initInput() {
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.renderer.domElement.addEventListener('pointerup', this.onPointerEnd.bind(this));
    this.renderer.domElement.addEventListener('cancel', this.onPointerEnd.bind(this));
  }

  private update(updateTimeMS: number) {
    const deltaTimeS = (updateTimeMS - this.lastUpdateTimeMS) / 1000;
    // Do stuff
    this.elasticMesh.update(deltaTimeS);
    // update camera orbit
    this.orbitControls.update()
    // render
    this.renderer.render(this.scene, this.camera);
    // loop
    this.lastUpdateTimeMS = updateTimeMS;
    setTimeout(() => {
      requestAnimationFrame(this.update.bind(this));
    }, 1000 / MAX_FPS);
  }

  onPointerDown(event: PointerEvent) {
    const pointerPos = new Vector2(event.clientX, event.clientY);
    this.lastPointerPosition = this.normalizedPointerPosition(new Vector2().copy(pointerPos));
    this.pointerStartPosition = new Vector2().copy(pointerPos);
    this.raycaster.setFromCamera(this.normalizedPointerPosition(pointerPos), this.camera);
    const intersections = this.raycaster.intersectObjects(this.scene.children, false);
    this.raycastIntersection = intersections.find((i) => i.object.userData.elasticMesh);
    if (this.raycastIntersection) {
      console.log('HIT:', this.raycastIntersection);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.raycastIntersection) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerPosition = this.normalizedPointerPosition(new Vector2(event.clientX, event.clientY));
    const pointerDelta = new Vector2().copy(this.lastPointerPosition).sub(pointerPosition);
    pointerDelta.y *= -1;
    const elasticMesh = this.raycastIntersection.object as ElasticMesh;
    const offset = this.raycastIntersection.point
      .add(new Vector3(-pointerDelta.x, pointerDelta.y, 0))
      .applyQuaternion(new Quaternion().setFromEuler(this.camera.rotation))
    elasticMesh.stretch(this.raycastIntersection.point, offset);
  }

  onPointerEnd(event: PointerEvent) {
    if (!this.raycastIntersection) return;
    this.raycastIntersection = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    event.preventDefault();
    this.elasticMesh.resetStretch();
  }

  onResizeEvent() {
    const target = this.options.renderTarget;
    const rtWidth = target.clientWidth;
    const rtHeight = target.clientHeight;
    this.camera.aspect = rtWidth / rtHeight;
    this.renderer.setSize(rtWidth, rtHeight);
    this.camera.updateProjectionMatrix();
  }

  normalizedPointerPosition(pointerPosition: Vector2) {
    const renderTargetRect = this.options.renderTarget.getBoundingClientRect();
    return new Vector2(
      ((pointerPosition.x - renderTargetRect.left) / this.options.renderTarget.clientWidth) * 2 - 1,
      -(((pointerPosition.y - renderTargetRect.top) / this.options.renderTarget.clientHeight) * 2 - 1)
    );
  }

}
