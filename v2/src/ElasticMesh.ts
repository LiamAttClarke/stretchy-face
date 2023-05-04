import {
  BufferGeometry,
  Mesh,
  Material,
  Vector3,
  Intersection,
} from "three";
import Constraint from "./Constraint";
import Particle from "./Particle";

export interface ElasticMeshOptions {
  particleMass: number,
  stiffness: number;
  originStiffness: number;
  drag: number;
  damping: number;
  pinchRadius: number;
}

export default class ElasticMesh extends Mesh {

  get particleMass() { return this._options.particleMass; }
  set particleMass(value) { this._options.particleMass = value; }

  get stiffness() { return this._options.stiffness; }
  set stiffness(value) {
    this._options.stiffness = value;
    this._constraintsDirty = true;
  }

  get originStiffness() { return this._options.originStiffness; }
  set originStiffness(value) {
    this._options.originStiffness = value;
    this._constraintsDirty = true;
  }

  get drag() { return this._options.drag; }
  set drag(value) { this._options.drag = value; }

  get damping() { return this._options.damping; }
  set damping(value) { this._options.damping = value; }

  get pinchRadius() { return this._options.pinchRadius; }
  set pinchRadius(value) { this._options.pinchRadius = value; }

  private _options: ElasticMeshOptions;
  private _particles: Particle[] = [];
  private _constraints: Constraint[] = [];
  private _vertIndexToParticle: Record<number, Particle> = {};
  private _targetParticles: Particle[] = [];
  private _constraintsDirty = true;

  constructor(
    geometry: BufferGeometry,
    material: Material | Material[],
    options: ElasticMeshOptions,
  ) {
    super(geometry, material);
    this.userData["elasticMesh"] = true;
    this._options = options;
    this.initialize();
  }

  stretch(intersection: Intersection, targetPosition: Vector3) {
    if (!this._targetParticles.length) {
      const triangleCenter = new Vector3()
        .add(this._vertIndexToParticle[intersection.face.a].position)
        .add(this._vertIndexToParticle[intersection.face.b].position)
        .add(this._vertIndexToParticle[intersection.face.c].position)
        .divideScalar(3)
      this._particles.forEach((p) => {
        const sqrDistanceFromPinch = p.position.distanceToSquared(triangleCenter);
        const distanceFromPinch = Math.sqrt(sqrDistanceFromPinch);
        if (distanceFromPinch < this._options.pinchRadius) {
          p.meta.pinchStartPosition = p.position.clone();
          p.meta.sqrDistanceFromPinch = sqrDistanceFromPinch;
          p.meta.distanceFromPinch = distanceFromPinch;
          p.isFixed = true;
          this._targetParticles.push(p);
        }
      });
    }
    const intersectionDelta = new Vector3().subVectors(targetPosition, intersection.point);
    const offset = new Vector3();
    const particlePosition = new Vector3();
    this._targetParticles.forEach((p) => {
      offset.copy(intersectionDelta)
        .multiplyScalar(1 - (p.meta.sqrDistanceFromPinch / Math.pow(this._options.pinchRadius, 2)));
      p.setPosition(particlePosition.copy(p.meta.pinchStartPosition).add(offset));
    });
  }

  resetStretch() {
    this._targetParticles.forEach((p) => p.isFixed = false);
    this._targetParticles = [];
  }

  update(deltaTimeMS: number) {
    // Update constraints
    if (this._constraintsDirty) {
      this._constraints.forEach((c) => {
        c.stiffness = this._options.stiffness;
        c.originStiffness = this._options.originStiffness;
        c.update()
      });
    }
    // Update particle positions
    this._particles.forEach((p) => {
      p.mass = this._options.particleMass;
      p.dragFactor = this._options.drag;
      p.dampingFactor = this._options.damping;
      p.updatePosition(deltaTimeMS);
      p.vertexIndices.forEach((i) => {
        this.geometry.attributes.position.setXYZ(
          i,
          p.position.x,
          p.position.y,
          p.position.z,
        );
      });
    });
    this.geometry.computeVertexNormals();
    this.geometry.attributes.position.needsUpdate = true;
  }

  private getVertexKey(vertex: Vector3): string {
    const precision = 6;
    const key = `${vertex.x.toFixed(precision)},${vertex.y.toFixed(precision)},${vertex.z.toFixed(precision)}`;
    return key;
  }

  private initialize() {
    this._constraints = [];
    const vertices = this.getVertices();
    // Find vertex groups
    const vertexGroupMap: Record<string, Particle> = {};
    for (let i = 0; i < this.geometry.index.array.length; i++) {
      const vertexIndex = this.geometry.index.array[i];
      const vertex = vertices[vertexIndex];
      const key = this.getVertexKey(vertex);
      const particle = vertexGroupMap[key] || (
        new Particle(vertex, this._options.particleMass, this._options.drag, this._options.damping)
      );
      particle.vertexIndices.push(vertexIndex);
      vertexGroupMap[key] = particle;
      this._vertIndexToParticle[vertexIndex] = particle;
    }
    this._particles = Object.values(vertexGroupMap);
    for (let i = 0; i < this.geometry.index.array.length; i += 3) {
      const v0 = vertices[this.geometry.index.array[i]];
      const v1 = vertices[this.geometry.index.array[i + 1]];
      const v2 = vertices[this.geometry.index.array[i + 2]];
      this._constraints.push(
        new Constraint(
          vertexGroupMap[this.getVertexKey(v0)],
          vertexGroupMap[this.getVertexKey(v1)],
          this._options.stiffness,
          this._options.originStiffness,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v1)],
          vertexGroupMap[this.getVertexKey(v2)],
          this._options.stiffness,
          this._options.originStiffness,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v2)],
          vertexGroupMap[this.getVertexKey(v0)],
          this._options.stiffness,
          this._options.originStiffness,
        )
      );
    }
  }

  private getVertices(): Vector3[] {
    const positions = this.geometry.getAttribute("position").array;
    const vertices: Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(new Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2],
      ));
    }
    return vertices;
  }
}
