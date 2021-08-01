import { Vector3 } from "three";

export default class Particle {
  // Index of all overlapping vertices at this point
  vertexIndices: number[] = [];
  origin: Vector3;
  prevPosition: Vector3;
  position: Vector3;
  mass: number;
  acceleration = new Vector3();
  drag: number;

  private invMass: number;

  // reused vector instances
  private tempForce = new Vector3();

  get velocity(): Vector3 {
    return new Vector3().subVectors(this.position, this.prevPosition);
  }

  get toOrigin(): Vector3 {
    return new Vector3().subVectors(this.origin, this.position);
  }

  constructor(position: Vector3, mass: number, drag: number = 1.0) {
    this.origin = position.clone();
    this.prevPosition = position.clone();
    this.position = position.clone();
    this.mass = mass;
    this.invMass = 1 / mass;
    this.drag = drag;
  }

  addForce(force: Vector3): this {
    // f = ma -> a = f/m
    this.acceleration.add(
      this.tempForce.copy(force).multiplyScalar(this.invMass)
    );
    return this;
  }

  updatePosition(deltaSeconds: number): this {
    const newPosition = this.velocity
      .multiplyScalar(this.drag)
      .add(this.position)
      .add(this.acceleration.multiplyScalar(deltaSeconds));
    this.prevPosition.copy(this.position);
    this.position = newPosition;
    this.acceleration.set(0, 0, 0);
    return this;
  }
}
