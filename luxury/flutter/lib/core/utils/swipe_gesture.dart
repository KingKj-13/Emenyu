import 'package:flutter/gestures.dart';

enum SwipeDirection { up, down, left, right, none }

/// Determines swipe direction from a pan gesture's release velocity.
/// Picks whichever axis had the larger movement, then requires a minimum
/// velocity so a slow drag/tap doesn't get misread as a swipe.
SwipeDirection detectSwipe(DragEndDetails details, {double threshold = 250}) {
  final velocity = details.velocity.pixelsPerSecond;
  if (velocity.dx.abs() > velocity.dy.abs()) {
    if (velocity.dx.abs() < threshold) return SwipeDirection.none;
    return velocity.dx < 0 ? SwipeDirection.left : SwipeDirection.right;
  } else {
    if (velocity.dy.abs() < threshold) return SwipeDirection.none;
    return velocity.dy < 0 ? SwipeDirection.up : SwipeDirection.down;
  }
}
