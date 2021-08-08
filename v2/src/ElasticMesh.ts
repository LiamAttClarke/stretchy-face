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

  options: ElasticMeshOptions = {
    particleMass: 0.1,
    stiffness: 0.4,
    originStiffness: 0.01,
    drag: 1,
    damping: 0.1,
    pinchRadius: 0.2,
  };

  private particles: Particle[] = [];
  private constraints: Constraint[] = [];
  private vertIndexToParticle: Record<number, Particle> = {};
  private targetParticles: Particle[] = [];

  constructor(
    geometry: BufferGeometry,
    material: Material | Material[],
    options: Partial<ElasticMeshOptions> = {},
  ) {
    super(geometry, material);
    this.userData["elasticMesh"] = true;
    Object.assign(this.options, options);
    this.initialize();
  }

  stretch(intersection: Intersection, targetPosition: Vector3) {
    if (!this.targetParticles.length) {
      console.log(this.options);
      const triangleCenter = new Vector3()
        .add(this.vertIndexToParticle[intersection.face.a].position)
        .add(this.vertIndexToParticle[intersection.face.b].position)
        .add(this.vertIndexToParticle[intersection.face.c].position)
        .divideScalar(3)
      this.particles.forEach((p) => {
        const sqrDistanceFromPinch = p.position.distanceToSquared(triangleCenter);
        const distanceFromPinch = Math.sqrt(sqrDistanceFromPinch);
        if (distanceFromPinch < this.options.pinchRadius) {
          p.meta.pinchStartPosition = p.position.clone();
          p.meta.sqrDistanceFromPinch = sqrDistanceFromPinch;
          p.meta.distanceFromPinch = distanceFromPinch;
          p.isFixed = true;
          this.targetParticles.push(p);
        }
      });
    }
    const intersectionDelta = new Vector3().subVectors(targetPosition, intersection.point);
    const offset = new Vector3();
    const particlePosition = new Vector3();
    this.targetParticles.forEach((p) => {
      offset.copy(intersectionDelta)
        .multiplyScalar(1 - (p.meta.sqrDistanceFromPinch / Math.pow(this.options.pinchRadius, 2)));
      p.setPosition(particlePosition.copy(p.meta.pinchStartPosition).add(offset));
    });
  }

  resetStretch() {
    this.targetParticles.forEach((p) => p.isFixed = false);
    this.targetParticles = [];
  }

  update(deltaSeconds: number) {
    // Update constraints
    this.constraints.forEach((c) => {
      c.stiffness = this.options.stiffness;
      c.originStiffness = this.options.originStiffness;
      c.update()
    });
    // Update particle positions
    this.particles.forEach((p) => {
      p.mass = this.options.particleMass;
      p.dragFactor = this.options.drag;
      p.dampingFactor = this.options.damping;
      p.updatePosition(deltaSeconds);
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
    this.constraints = [];
    const vertices = this.getVertices();
    // Find vertex groups
    const vertexGroupMap: Record<string, Particle> = {};
    for (let i = 0; i < this.geometry.index.array.length; i++) {
      const vertexIndex = this.geometry.index.array[i];
      const vertex = vertices[vertexIndex];
      const key = this.getVertexKey(vertex);
      const particle = vertexGroupMap[key] || (
        new Particle(vertex, this.options.particleMass, this.options.drag, this.options.damping)
      );
      particle.vertexIndices.push(vertexIndex);
      vertexGroupMap[key] = particle;
      this.vertIndexToParticle[vertexIndex] = particle;
    }
    this.particles = Object.values(vertexGroupMap);
    for (let i = 0; i < this.geometry.index.array.length; i += 3) {
      const v0 = vertices[this.geometry.index.array[i]];
      const v1 = vertices[this.geometry.index.array[i + 1]];
      const v2 = vertices[this.geometry.index.array[i + 2]];
      this.constraints.push(
        new Constraint(
          vertexGroupMap[this.getVertexKey(v0)],
          vertexGroupMap[this.getVertexKey(v1)],
          this.options.stiffness,
          this.options.originStiffness,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v1)],
          vertexGroupMap[this.getVertexKey(v2)],
          this.options.stiffness,
          this.options.originStiffness,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v2)],
          vertexGroupMap[this.getVertexKey(v0)],
          this.options.stiffness,
          this.options.originStiffness,
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
