//
//  VirtualControlsApp.swift
//  VirtualControls
//
//  Created by Pranav Vaithiya Subramani on 2/26/26.
//

import SwiftUI

@main
struct VirtualControlsApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var backendService = BackendService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(backendService)
                .preferredColorScheme(.dark)
        }
    }
}


