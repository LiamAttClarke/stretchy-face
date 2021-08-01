import {
  BufferGeometry,
  Mesh,
  Material,
  Vector3,
} from 'three';
import Constraint from './Constraint';
import Particle from './Particle';

const DEFAULT_PARTICLE_MASS = 1; // 0.01 = 10 grams
const STIFFNESS = 0.5;
const DAMPING = 0.1;
const DRAG = 1 - DAMPING;
const STRETCH_FACTOR = 0.1;

interface ElasticMeshOptions {
  stiffness: number;
}

export default class ElasticMesh extends Mesh {

  private options: ElasticMeshOptions = {
    stiffness: STIFFNESS,
  };

  private particles: Particle[] = [];
  private contraints: Constraint[] = [];
  private targetParticles: Particle[] = [];

  constructor(
    geometry: BufferGeometry,
    material: Material | Material[],
    options: Partial<ElasticMeshOptions> = {},
  ) {
    super(geometry, material);
    this.userData['elasticMesh'] = true;
    Object.assign(this.options, options);
    this.initialize();
  }

  particlesAroundPoint(point: Vector3, radius: number): Particle[] {
    const localPoint = this.worldToLocal(point);
    return this.particles.filter((p) => {
      const dist = p.position.distanceTo(localPoint);
      return dist < radius;
    });
  }

  stretch(point: Vector3, offset: Vector3) {
    if (!this.targetParticles.length) {
      this.targetParticles = this.particlesAroundPoint(point, 0.1);
    }
    this.targetParticles.forEach((p) => {
      p.position.add(offset.multiplyScalar(STRETCH_FACTOR))
    });
  }

  resetStretch() {
    this.targetParticles = [];
  }

  update(deltaSeconds: number) {
    // Update point masses
    this.contraints.forEach((c) => c.update());
    this.particles.forEach((p) => {
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
    this.contraints = [];
    const vertices = this.getVertices();
    // Find vertex groups
    const vertexGroupMap: Record<string, Particle> = {};
    for (let i = 0; i < this.geometry.index.array.length; i++) {
      const vertexIndex = this.geometry.index.array[i];
      const vertex = vertices[vertexIndex];
      const key = this.getVertexKey(vertex);
      const point = vertexGroupMap[key] || (
        new Particle(vertex, DEFAULT_PARTICLE_MASS, DRAG)
      );
      point.vertexIndices.push(vertexIndex);
      vertexGroupMap[key] = point;
    }
    this.particles = Object.values(vertexGroupMap);
    for (let i = 0; i < this.geometry.index.array.length; i += 3) {
      const v0 = vertices[this.geometry.index.array[i]];
      const v1 = vertices[this.geometry.index.array[i + 1]];
      const v2 = vertices[this.geometry.index.array[i + 2]];
      this.contraints.push(
        new Constraint(
          vertexGroupMap[this.getVertexKey(v0)],
          vertexGroupMap[this.getVertexKey(v1)],
          STIFFNESS,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v1)],
          vertexGroupMap[this.getVertexKey(v2)],
          STIFFNESS,
        ),
        new Constraint(
          vertexGroupMap[this.getVertexKey(v2)],
          vertexGroupMap[this.getVertexKey(v0)],
          STIFFNESS,
        )
      );
    }
  }

  private getVertices(): Vector3[] {
    const positions = this.geometry.getAttribute('position').array;
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
