import { Vector3 } from "three";

export default class Particle {
  // Index of all overlapping vertices at this point
  vertexIndices: number[] = [];
  origin: Vector3;
  prevPosition: Vector3;
  position: Vector3;
  mass: number;
  acceleration = new Vector3();
  dragFactor: number;
  dampingFactor: number;
  isFixed = false;
  meta: Record<any, any> = {};

  private invMass: number;
  private tempDragVector = new Vector3();

  // reused vector instances
  private tempForce = new Vector3();

  get toOrigin(): Vector3 {
    return new Vector3().subVectors(this.origin, this.position);
  }

  constructor(
    position: Vector3,
    mass: number,
    dragFactor: number = 0.1,
    dampingFactor: number = 0.1,
  ) {
    this.origin = position.clone();
    this.prevPosition = position.clone();
    this.position = position.clone();
    this.mass = mass;
    this.dragFactor = dragFactor;
    this.dampingFactor = dampingFactor;
  }

  setPosition(position: Vector3): this {
    this.prevPosition.copy(position);
    this.position.copy(position);
    this.acceleration.set(0, 0, 0);
    return this;
  }

  addForce(force: Vector3): this {
    if (this.isFixed) return;
    // f = ma -> a = f/m
    this.acceleration.add(
      this.tempForce.copy(force).multiplyScalar(1 / this.mass)
    );
    return this;
  }

  computeVelocity(): Vector3 {
    return new Vector3().subVectors(this.position, this.prevPosition);
  }

  computeDrag(velocity: Vector3): Vector3 {
    return this.tempDragVector.copy(velocity)
      .normalize()
      .multiplyScalar(
        -this.dragFactor
        * Math.pow(velocity.length(), 2)
      )
  }

  updatePosition(deltaSeconds: number): this {
    if (this.isFixed) return;
    // verlet integration
    const velocity = this.computeVelocity();
    const drag = this.computeDrag(velocity);
    const newPosition = velocity
      .multiplyScalar(1 - this.dampingFactor)
      .add(drag)
      .add(this.position)
      .add(this.acceleration.multiplyScalar(deltaSeconds));
    this.prevPosition.copy(this.position);
    this.position = newPosition;
    this.acceleration.set(0, 0, 0);
    return this;
  }
}
