import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/utils/media_url.dart';
import 'package:luxury_tablet/core/widgets/cinematic_pan.dart';
import 'package:luxury_tablet/core/widgets/luxury_image.dart';

class LivingPhotograph extends StatefulWidget {
  final String imageUrl;
  final String videoUrl;
  final Function(String)? onError;
  final double borderRadius;
  final bool showPlayButton;

  const LivingPhotograph({
    super.key,
    required this.imageUrl,
    required this.videoUrl,
    this.onError,
    this.borderRadius = 8.0,
    this.showPlayButton = true,
  });

  @override
  State<LivingPhotograph> createState() => _LivingPhotographState();
}

class _LivingPhotographState extends State<LivingPhotograph> {
  VideoPlayerController? _controller;
  bool _isVideoInitialized = false;
  double _videoOpacity = 0.0;
  Timer? _startTimer;
  bool _playedOnce = false;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  @override
  void didUpdateWidget(covariant LivingPhotograph oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.videoUrl != widget.videoUrl ||
        oldWidget.imageUrl != widget.imageUrl) {
      _resetVideo();
    }
  }

  Future<void> _initVideo() async {
    if (widget.videoUrl.isEmpty) return;

    _controller = widget.videoUrl.startsWith('assets/')
        ? VideoPlayerController.asset(widget.videoUrl)
        : VideoPlayerController.networkUrl(Uri.parse(resolveMediaUrl(widget.videoUrl)));
    try {
      await _controller!.initialize();
      if (!mounted) return;

      setState(() {
        _isVideoInitialized = true;
      });

      _controller!.addListener(_videoListener);

      // Start 3-second delay timer before autoplaying
      _startTimer = Timer(const Duration(seconds: 3), () {
        if (mounted && _isVideoInitialized && !_playedOnce) {
          _controller!.play();
          setState(() {
            _videoOpacity = 1.0;
          });
        }
      });
    } catch (_) {}
  }

  void _videoListener() {
    if (_controller == null || !mounted) return;

    final position = _controller!.value.position;
    final duration = _controller!.value.duration;

    if (position >= duration && !_playedOnce) {
      _playedOnce = true;
      _controller!.removeListener(_videoListener);

      setState(() {
        _videoOpacity = 0.0;
      });

      Future.delayed(const Duration(milliseconds: 600), () {
        if (mounted) {
          _controller!.pause();
        }
      });
    }
  }

  void _resetVideo() {
    _startTimer?.cancel();
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    _controller = null;
    _isVideoInitialized = false;
    _videoOpacity = 0.0;
    _playedOnce = false;
    _initVideo();
  }

  @override
  void dispose() {
    _startTimer?.cancel();
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    super.dispose();
  }

  Widget _buildHeroImage() {
    return LuxuryImage(
      path: widget.imageUrl,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
    );
  }

  Widget _buildErrorPlaceholder() {
    return Container(
      color: LuxuryColors.warmDarkBrown,
      child: const Center(
        child: Icon(
          Icons.broken_image_outlined,
          color: LuxuryColors.brushedBronze,
          size: 48,
        ),
      ),
    );
  }

  Widget _buildPlayButton() {
    if (!widget.showPlayButton || widget.videoUrl.isEmpty) {
      return const SizedBox.shrink();
    }

    return Center(
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withOpacity(0.5),
          border: Border.all(
            color: LuxuryColors.white.withOpacity(0.8),
            width: 2,
          ),
        ),
        child: const Icon(
          Icons.play_arrow_rounded,
          color: LuxuryColors.white,
          size: 36,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.borderRadius),
      child: Container(
        color: LuxuryColors.backgroundDarkest,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 1. Static Hero Image with Cinematic Panning
            CinematicPan(
              child: _buildHeroImage(),
            ),

            // 2. Cinematic Video overlay
            if (_isVideoInitialized && _controller != null)
              AnimatedOpacity(
                opacity: _videoOpacity,
                duration: const Duration(milliseconds: 600),
                curve: Curves.easeInOut,
                child: SizedBox.expand(
                  child: FittedBox(
                    fit: BoxFit.cover,
                    clipBehavior: Clip.hardEdge,
                    child: SizedBox(
                      width: _controller!.value.size.width,
                      height: _controller!.value.size.height,
                      child: VideoPlayer(_controller!),
                    ),
                  ),
                ),
              ),

            // 3. Subtle bottom gradient for text readability
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              height: 100,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withOpacity(0.6),
                    ],
                  ),
                ),
              ),
            ),

            // 4. Play button overlay
            if (_videoOpacity == 0.0) _buildPlayButton(),
          ],
        ),
      ),
    );
  }
}
