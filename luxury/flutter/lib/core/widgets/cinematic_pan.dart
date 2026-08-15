import 'dart:math';
import 'package:flutter/material.dart';

class CinematicPan extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final double maxScale;

  const CinematicPan({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 40),
    this.maxScale = 1.08,
  });

  @override
  State<CinematicPan> createState() => _CinematicPanState();
}

class _CinematicPanState extends State<CinematicPan>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<Offset> _panAnimation;

  final Random _random = Random();

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);

    _generateAnimations();

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _generateAnimations();
        _controller.forward(from: 0.0);
      }
    });

    _controller.forward();
  }

  void _generateAnimations() {
    // Randomize start and end scale between 1.0 and maxScale
    final startScale = 1.0 + _random.nextDouble() * (widget.maxScale - 1.0);
    final endScale = 1.0 + _random.nextDouble() * (widget.maxScale - 1.0);

    _scaleAnimation = Tween<double>(begin: startScale, end: endScale).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );

    // Randomize pan offsets (small movements)
    final startOffset = Offset(
      (_random.nextDouble() - 0.5) * 0.03,
      (_random.nextDouble() - 0.5) * 0.03,
    );
    final endOffset = Offset(
      (_random.nextDouble() - 0.5) * 0.03,
      (_random.nextDouble() - 0.5) * 0.03,
    );

    _panAnimation = Tween<Offset>(begin: startOffset, end: endOffset).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(
            _panAnimation.value.dx * MediaQuery.of(context).size.width,
            _panAnimation.value.dy * MediaQuery.of(context).size.height,
          ),
          child: Transform.scale(
            scale: _scaleAnimation.value,
            child: widget.child,
          ),
        );
      },
    );
  }
}
