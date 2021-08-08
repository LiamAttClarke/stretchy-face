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
  MeshNormalMaterial,
  Vector3,
  SphereBufferGeometry,
  TextureLoader,
  DoubleSide,
  MeshPhongMaterial,
  BoxBufferGeometry,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as dat from "dat.gui";
import ElasticMesh, { ElasticMeshOptions } from "./ElasticMesh";

const MODEL_PATH = "/assets/liam.glb";
const TEXTURE_PATH = "/assets/liam_texture.png";
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
  private raycaster = new Raycaster();
  private pointerIntersection: Intersection|null = null;
  private elasticMeshOptions: Partial<ElasticMeshOptions> = {};
  private meshControls = new dat.GUI({
    name: "Control Panel"
  });
  private hitMarker = new Mesh(new SphereBufferGeometry(0.1, 4, 4), new MeshNormalMaterial());

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

    window.addEventListener("resize", this.onResizeEvent.bind(this));

    this.initScene().then(() => {
      // mesh controls
      this.meshControls.add(this.elasticMesh.options, "particleMass", 0.1, 1, 0.001);
      this.meshControls.add(this.elasticMesh.options, "stiffness", 0.01, 1, 0.01);
      this.meshControls.add(this.elasticMesh.options, "originStiffness", 0, 0.15, 0.01);
      this.meshControls.add(this.elasticMesh.options, "drag", 0, 1, 0.01);
      this.meshControls.add(this.elasticMesh.options, "damping", 0, 0.5, 0.01);
      this.meshControls.add(this.elasticMesh.options, "pinchRadius", 0.1, 1, 0.01);
      this.initInput();
      this.update(performance.now());
    });
  }

  private async loadElasticMesh(modelPath: string, texturePath: string): Promise<ElasticMesh> {
    return new ElasticMesh(new BoxBufferGeometry(1, 1, 1, 16, 16, 16), new MeshNormalMaterial(), this.elasticMeshOptions);
    // const texture = await new TextureLoader().loadAsync(texturePath);
    // texture.flipY = false;
    // const material = new MeshPhongMaterial({
    //   map: texture,
    //   side: DoubleSide
    // });
    // const gltf = await new GLTFLoader().loadAsync(modelPath);
    // let elasticMesh: ElasticMesh = null;
    // gltf.scene.traverse((obj) => {
    //   if (obj.type === "Mesh") {
    //     const originalMesh = obj as Mesh;
    //     originalMesh.geometry.computeVertexNormals();
    //     // elasticMesh = new ElasticMesh(originalMesh.geometry, new MeshNormalMaterial({ side: DoubleSide }), this.elasticMeshOptions);
    //     // elasticMesh = new ElasticMesh(originalMesh.geometry, material);
    //   }
    // })
    // return elasticMesh;
  }

  private async initScene() {
    // light
    const ambientLight = new AmbientLight(0xffffff, 0.8);
    const directionalLight = new DirectionalLight(0xffffff, 0.9);
    this.scene.add(ambientLight, directionalLight);
    // mesh
    this.elasticMesh = await this.loadElasticMesh(MODEL_PATH, TEXTURE_PATH);
    this.scene.add(this.elasticMesh);

    // this.scene.add(this.hitMarker);
  }

  private initInput() {
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown.bind(this));
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove.bind(this));
    this.renderer.domElement.addEventListener("pointerup", this.onPointerEnd.bind(this));
    this.renderer.domElement.addEventListener("cancel", this.onPointerEnd.bind(this));
  }

  private update(updateTimeMS: number) {
    const deltaTimeS = (updateTimeMS - this.lastUpdateTimeMS) / 1000;
    // Do stuff
    this.elasticMesh.update(deltaTimeS);
    // update camera orbit
    this.orbitControls.update();
    // render
    this.renderer.render(this.scene, this.camera);
    // loop
    this.lastUpdateTimeMS = updateTimeMS;
    setTimeout(() => {
      requestAnimationFrame(this.update.bind(this));
    }, 1000 / MAX_FPS);
  }

  onPointerDown(event: PointerEvent) {
    const pointerScreenPosition = this.pointerToScreen(new Vector2(event.clientX, event.clientY));
    this.raycaster.setFromCamera(pointerScreenPosition, this.camera);
    this.pointerIntersection = this.raycaster
      .intersectObjects(this.scene.children, false)
      .find((i) => i.object.userData.elasticMesh);
    if (this.pointerIntersection) {
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.pointerIntersection) return;
    event.preventDefault();
    event.stopPropagation();
    const elasticMesh = this.pointerIntersection.object as ElasticMesh;
    const pointerPosition = this.pointerToScreen(new Vector2(event.clientX, event.clientY));
    const pointerWorldPosition = this.screenToWorld(pointerPosition);
    const pointerDir = new Vector3().subVectors(pointerWorldPosition, this.camera.position).normalize();
    pointerWorldPosition.add(
      pointerDir.multiplyScalar(this.pointerIntersection.distance)
    );
    elasticMesh.stretch(
      this.pointerIntersection,
      pointerWorldPosition,
    );
  }

  onPointerEnd(event: PointerEvent) {
    if (!this.pointerIntersection) return;
    this.pointerIntersection = null;
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

  pointerToScreen(pointerPosition: Vector2) {
    const renderTargetRect = this.options.renderTarget.getBoundingClientRect();
    return new Vector2(
      ((pointerPosition.x - renderTargetRect.left) / this.options.renderTarget.clientWidth) * 2 - 1,
      -(((pointerPosition.y - renderTargetRect.top) / this.options.renderTarget.clientHeight) * 2 - 1)
    );
  }

  screenToWorld(screenPosition: Vector2): Vector3 {
    return new Vector3(screenPosition.x, screenPosition.y, -1).unproject(this.camera);
  }

}
