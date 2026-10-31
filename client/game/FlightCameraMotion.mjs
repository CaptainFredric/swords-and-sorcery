// Restrained physical camera response for Fight-and-Flight cockpit.
// Driven by genuine authoritative vehicle motion, respecting cameraMotion settings.
// Pure 1:1 responsive aiming: rotational spring is added on top of direct look.
export class FlightCameraMotion {
  constructor() {
    this.posSpring = { x: 0, y: 0, z: 0 };
    this.posVel = { x: 0, y: 0, z: 0 };
    this.rotSpring = { pitch: 0, roll: 0 };
    this.rotVel = { pitch: 0, roll: 0 };
    this.lastVelY = 0;
    this.lastSpeed = 0;
    this.wasGrounded = true;
    this.lastShotAt = -Infinity;
    this.walkPhase = 0;
  }

  reset() {
    this.posSpring = { x: 0, y: 0, z: 0 };
    this.posVel = { x: 0, y: 0, z: 0 };
    this.rotSpring = { pitch: 0, roll: 0 };
    this.rotVel = { pitch: 0, roll: 0 };
    this.lastVelY = 0;
    this.lastSpeed = 0;
    this.wasGrounded = true;
    this.lastShotAt = -Infinity;
    this.walkPhase = 0;
  }

  update(dt, machine, cameraMotion = 1) {
    if (!machine || !(cameraMotion > 0.01) || dt <= 0) {
      this.posSpring.x = 0; this.posSpring.y = 0; this.posSpring.z = 0;
      this.rotSpring.pitch = 0; this.rotSpring.roll = 0;
      return { offset: { x: 0, y: 0, z: 0 }, pitch: 0, roll: 0 };
    }

    const clampedDt = Math.min(0.1, dt);
    const m = machine;
    const speed = Math.hypot(m.velocity?.x ?? 0, m.velocity?.z ?? 0);
    const vy = m.velocity?.y ?? 0;
    const grounded = Boolean(m.grounded);

    // 1. Landing impulse and equipment settling: proportional to vertical impact
    if (grounded && !this.wasGrounded) {
      const impact = Math.min(8, Math.max(1.2, Math.abs(this.lastVelY)));
      this.posVel.y -= impact * 0.045; // downward compression
      this.rotVel.pitch += impact * 0.025;  // forward nod as feet contact turf
    } else if (grounded && this.lastVelY < -1.5) {
      const impact = Math.min(6, Math.abs(this.lastVelY));
      this.posVel.y -= impact * 0.04;
      this.rotVel.pitch += impact * 0.02;
    }

    // 2. Takeoff surge and harness lift reaction
    if (!grounded && this.wasGrounded && vy > 0.3) {
      this.posVel.y -= 0.045; // initial downward inertia as machine lifts off
      this.rotVel.pitch += 0.02; // slight upward tilt
    }

    this.wasGrounded = grounded;
    this.lastVelY = vy;

    // 3. Weapon firing recoil: brief kick when a bolt releases
    if (m.lastShotAt && m.lastShotAt !== this.lastShotAt) {
      this.lastShotAt = m.lastShotAt;
      this.posVel.z += 0.018; // slight backward kick in local space
      this.rotVel.pitch += 0.012; // slight upward pitch kick
    }

    // 4. Ground walking cadence bob
    let targetY = 0;
    let targetPitch = 0;
    let targetRoll = 0;

    if (grounded && speed > 0.3) {
      this.walkPhase = (this.walkPhase + clampedDt * speed * 4.2) % (Math.PI * 2);
      targetY += Math.sin(this.walkPhase) * 0.015;
      targetRoll += Math.cos(this.walkPhase * 0.5) * 0.008;
    }

    // 5. Horizontal acceleration / braking reaction
    const accel = (speed - this.lastSpeed) / clampedDt;
    this.lastSpeed = speed;
    if (accel > 1.8) {
      targetPitch += Math.min(0.025, accel * 0.0025);
    } else if (accel < -2.5) {
      targetPitch -= Math.min(0.035, Math.abs(accel) * 0.0035);
    }

    // 6. Climb / descent / takeoff inertia
    if (!grounded) {
      if (vy > 0.5) {
        targetY -= Math.min(0.025, vy * 0.005);
      } else if (vy < -0.5) {
        targetY += Math.min(0.02, Math.abs(vy) * 0.004);
      }
      if (speed > 1) {
        targetPitch -= Math.min(0.025, speed * 0.003);
      }
      if (m.offensiveRun) {
        targetPitch -= 0.035;
      }
      if ((m.rotorEnergy ?? 0) > 20 && (m.rotorHP ?? 0) > 0) {
        const rotorFreq = (m.rotorAngle ?? 0) * 2;
        targetY += Math.sin(rotorFreq) * 0.0025;
      }
    }

    // Spring damping constants: stiff, responsive, well-damped
    const kPos = 160;
    const dPos = 18;
    this.posVel.x += (0 - this.posSpring.x) * kPos * clampedDt - this.posVel.x * dPos * clampedDt;
    this.posVel.y += (targetY - this.posSpring.y) * kPos * clampedDt - this.posVel.y * dPos * clampedDt;
    this.posVel.z += (0 - this.posSpring.z) * kPos * clampedDt - this.posVel.z * dPos * clampedDt;
    this.posSpring.x += this.posVel.x * clampedDt;
    this.posSpring.y += this.posVel.y * clampedDt;
    this.posSpring.z += this.posVel.z * clampedDt;

    const kRot = 140;
    const dRot = 16;
    this.rotVel.pitch += (targetPitch - this.rotSpring.pitch) * kRot * clampedDt - this.rotVel.pitch * dRot * clampedDt;
    this.rotVel.roll += (targetRoll - this.rotSpring.roll) * kRot * clampedDt - this.rotVel.roll * dRot * clampedDt;
    this.rotSpring.pitch += this.rotVel.pitch * clampedDt;
    this.rotSpring.roll += this.rotVel.roll * clampedDt;

    const scale = Math.min(1, Math.max(0, cameraMotion));
    return {
      offset: {
        x: this.posSpring.x * scale,
        y: this.posSpring.y * scale,
        z: this.posSpring.z * scale,
      },
      pitch: this.rotSpring.pitch * scale,
      roll: this.rotSpring.roll * scale,
    };
  }
}
