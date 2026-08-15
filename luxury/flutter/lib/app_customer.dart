import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/customer/screens/welcome_screen.dart';

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'EMenu Customer',
      debugShowCheckedModeBanner: false,
      theme: LuxuryTheme.darkTheme,
      routerConfig: _router,
    );
  }
}

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const WelcomeScreen(),
    ),
  ],
);
