import { Vector3 } from "three";
import Particle from "./Particle";

export default class Constraint {
  p0: Particle;
  p1: Particle;
  restLength: number;
  stiffness: number;
  originStiffness = 0.01;

  get length() {
    return this.p0.position.distanceTo(this.p1.position);
  }

  get direction() {
    return new Vector3().subVectors(this.p1.position, this.p0.position).normalize();
  }

  constructor(p0: Particle, p1: Particle, stiffness = 1.0) {
    this.p0 = p0;
    this.p1 = p1;
    this.stiffness = stiffness;
    this.restLength = p0.position.distanceTo(p1.position);
  }

  update() {
    const constraintForce = this.computeConstraintForce()
      // Halving force to split between constraint points
      .multiplyScalar(0.5);
    // apply spring force
    this.p0.addForce(constraintForce);
    this.p0.addForce(this.computeOriginForce(this.p0));
    this.p1.addForce(constraintForce.negate());
    this.p1.addForce(this.computeOriginForce(this.p1));
  }

  private computeOriginForce(particle: Particle): Vector3 {
    // Hooke's Law: f = kx
    const toOrigin = particle.toOrigin;
    const toOriginDist = toOrigin.length();
    return toOrigin.normalize().multiplyScalar(this.originStiffness * toOriginDist);
  }

  private computeConstraintForce(): Vector3 {
    // Hooke's Law: f = kx
    const extension = this.length - this.restLength;
    return this.direction.multiplyScalar(this.stiffness * extension);
  }
}
