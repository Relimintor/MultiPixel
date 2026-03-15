(function () {
  window.SingleplayerMobCore = {
    combat: {
      fistDamage: 1, // half-heart in half-heart units
      defaultHitDamage: 4,
      knockback: {
        horizontal: 4.2,
        vertical: 2.1,
        damping: 6.2
      }
    },
    feedback: {
      hitFlashMs: 140,
      hitFlashColor: 0xff3b30
    },
    death: {
      animationMs: 650,
      fallAngleRad: 1.46,
      sinkSpeed: 0.35
    }
  };
})();
