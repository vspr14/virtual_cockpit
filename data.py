from bs4 import BeautifulSoup
import pandas as pd
import re

# 1. Paste or load your HTML context here
html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <title>My Logbook - SkyTeam Virtual</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Accept-CH" content="DPR, Viewport-Width, Width">

        
    
    <link crossorigin rel="stylesheet" href="/vite-assets/assets/global-CCESSAG9.css" integrity="sha384-s/VZjwKwsQvtk85Z5t6yZN4Jpx5ND9FmJs5CU3zmyPF4tus0uCiww4T2shrmM8p7">
    <link crossorigin rel="modulepreload" href="/vite-assets/assets/preload-helper-DW7C9oU9.js" integrity="sha384-Br3L+DFOHn8bo4XZcSSenpaqCZn48cDK5QvuYXKj+b9WmarfeolWQidhpeNNsyS1"><link crossorigin rel="modulepreload" href="/vite-assets/assets/config-DTYdiD1p.js" integrity="sha384-zfE53N5VZZNda6KcbcOa4YtsLEbin0k7RtMSY1wJqYgtLcx+PYSl7KJwmLM8/rJe"><link crossorigin rel="modulepreload" href="/vite-assets/assets/CspProvider-B8L8ZOw6.js" integrity="sha384-MQ6YvDb16tJvewOQbyZ/sPj5ywo5hGM92KVx01EgjbPHs+4+BKRXOhF3RX72meMB"><link crossorigin rel="modulepreload" href="/vite-assets/assets/csp-D0tNXnmi.js" integrity="sha384-aaypitSDa+vm8X9ZR2mygvcyPDiTjx5zA1Yjdx6BvSqWb6Z5hytyOpJ+IY4hkCuF"><link crossorigin rel="modulepreload" href="/vite-assets/assets/react-select.esm-fF7TVN_E.js" integrity="sha384-ofxzc1spVE+HyftXiHlde8XjWN0VaRxaPlTmxiv2l0S8BcIMO02g3Y9NvFYoIZSA"><link crossorigin rel="modulepreload" href="/vite-assets/assets/floating-ui.dom-Bi8aE2r_.js" integrity="sha384-GYsy5fBJe6Tl/tI820YwwCicYqQGhL3QxYZWRJEeJquzvBILdZv2ex1JXvZyoc4s"><link crossorigin rel="modulepreload" href="/vite-assets/assets/jsx-runtime-CVpwNt3P.js" integrity="sha384-KZLQIsShogHaq42lGt+c03Sxc4aOUTyeWcXeyswAxGS2AUKsw/CO6YtEAEkVUqnQ"><link crossorigin rel="modulepreload" href="/vite-assets/assets/chunk-wfDwNXMd.js" integrity="sha384-tiEWYEBeQjOoUSrFwjR1i1tfG4EiMiDBlH4P0Y5sthjM3MMKPcgYjIMc6rXC5ty+"><link crossorigin rel="modulepreload" href="/vite-assets/assets/ReactQuerySelect-Cg4r1yfG.js" integrity="sha384-jAyYjB4uVnPh9CV7XxzOUQJ6c5xyCjMdGpujhZh0VRPoh3LJcDG7tJq5wCTI9u1E"><link crossorigin rel="modulepreload" href="/vite-assets/assets/hooks-nzXge-5u.js" integrity="sha384-bnZ5HKnryPk+qlIfosPiFogi8/Eq6N12ZsEbeJdxyOPNlPdw6mcchjlsjWm66juY"><link crossorigin rel="modulepreload" href="/vite-assets/assets/yup-DYt0nw4g.js" integrity="sha384-DSl+VkNqXora/s2fNIJdUCPf1/1DuRablcz4JRwaleSKwG8tsSJkJgN5GRZVYg2s"><link crossorigin rel="modulepreload" href="/vite-assets/assets/react-query-DAwwdp1o.js" integrity="sha384-jH/V8zdh9crIRgJfFfRkfDdczfs6Gpdsi9PLu5ejobF8/Uyva3IKjQqN+rtGRjF8"><link crossorigin rel="modulepreload" href="/vite-assets/assets/file-CKYghVCS.js" integrity="sha384-B4Ncv3YzeVlvevu4nbW8CpNBg63pA+urIh77dvnvtW+WB9PAEY/onnhZkrEsIcBo"><link crossorigin rel="modulepreload" href="/vite-assets/assets/from-json-H3ZLbHUa.js" integrity="sha384-xABT+gScF7z0Gw7bSudojXPCPrEvue78XZcQa64bd2YvtcvNWckPBPmbZ+DNwp4J"><link crossorigin rel="modulepreload" href="/vite-assets/assets/QueryClientProvider-CgvEst2k.js" integrity="sha384-m3cLekinZKx9D/L2ecMYdPpCR7F/r3nODRs8z3Fu9mBMuolVpAmWoEWeftdjXVqH"><link crossorigin rel="modulepreload" href="/vite-assets/assets/routing-2AchAUMW.js" integrity="sha384-03kLo24NxEYMfqb+GjboD50zUNdDcLLqodsSnzvTh1Q+i4tSKpGIvogJBFL3w7J7"><link crossorigin rel="modulepreload" href="/vite-assets/assets/uuid-CQa_hQrg.js" integrity="sha384-pBwYCIiCB6odDzzrPSvwAKCJcg0oWCiRFfHpaWJNb4hj6X8Zn0jELT7YQ0JxmUoL"><link crossorigin rel="modulepreload" href="/vite-assets/assets/lib-DgRynLxF.js" integrity="sha384-zV8rZqmURDj4hLtcVKC/Hl9TZ9nWp7IPw/1uMlX4sOzt872gKM3gfk8lPRhCREgq"><link crossorigin rel="modulepreload" href="/vite-assets/assets/bootstrap.esm-CYmmtzCr.js" integrity="sha384-dwYy02P9jla9AkyKhfDBJKvZ8Rx2UqVkxU5i0145yyy1/FVmXhM063v2G1m0WHNG"><link crossorigin rel="modulepreload" href="/vite-assets/assets/jquery-CHoqUxKn.js" integrity="sha384-RCkGY6JoLQW40tPHLUhJL3Zo2k8YLbiL/y7PS5ZKaICIT5oLrwgnyq5zTRMwL/tX"><link crossorigin rel="modulepreload" href="/vite-assets/assets/client-DZYefHTH.js" integrity="sha384-+pH5vquuWJzKs5PjevBMZl5PBNbfdbtjG8Oz7GNWc8dV5IV8+dfc5xf26w88Fl4M"><link crossorigin rel="modulepreload" href="/vite-assets/assets/chunk-EF7DTUVF-Bt2IQ3qv.js" integrity="sha384-W4oUSmt3CqgOQUghjnlP3NKg/aQbNPtf0xl1o/S33eFtLe4v7MGU2CWLD13GKLN1"><link crossorigin rel="modulepreload" href="/vite-assets/assets/sweetalert2.esm-D-O1JKlW.js" integrity="sha384-3utagdl8rGP0t2vZCF9jax/JuFJqmbudcOvwTW3ebDoTlL3Zg+ZD352loPQ8JLgA">

        <link
            rel="stylesheet"
            href="https://storage.skyteamvirtual.org/web/theme/css/skyteamvirtual-skyteam-virtual-7af7d68092799512e9fe722d63621182e267648fa8671147bc7341eff59e3c5a.css"
            integrity="sha384-GjM30GTd0pPk8fQDTXoF4T0HNO2c58NoKCHaIUsABdrvqOHw25iZRXPm0RxEfVBg"
            crossorigin="anonymous"
    />

        <link rel="apple-touch-icon" sizes="180x180" href="/styles/zesiro/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/styles/zesiro/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/styles/zesiro/android-chrome-192x192.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/styles/zesiro/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
        <link rel="mask-icon" href="/styles/zesiro/safari-pinned-tab.svg" color="#0B1761">
    <meta name="msapplication-TileColor" content="#0B1761">
    <meta name="theme-color" content="#0B1761">
    <meta property="csp-nonce" nonce="qP5o5fNHfBN1WofnIvU3BiF3koo" />

    
</head>

<body class="hold-transition skin-black-light layout-top-nav style-zesiro" data-logged-in="true">
<div class="wrapper">
            <nav class="navbar navbar-expand-lg navbar-custom"
             id="main-navigation">
            <div class="container-fluid">
                <a href="/" class="navbar-brand">
                                            <img src="https://images.vasystem.org/lNvFWnbdNh3cXyBRQ6pj6B754SPLH-5hukrpFVDufxc/rt:fill/g:sm/el:1/aHR0cHM6Ly9pbWFnZXMtc3RvcmFnZS52YXN5c3RlbS5vcmcvc2t5dGVhbXZpcnR1YWwvOWUvZGYvOWVkZjMzMDllN2ExYzkzN2FhZmQ1YmFjOGRlMTczN2VkMWI3ZDkwYS5wbmc"
                             alt="SkyTeam Virtual" height="50" />
                                    </a>

                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <div class="collapse navbar-collapse" id="navbarSupportedContent">
                                
        
                            
        <ul class="navbar-nav me-auto">                
    
        
        
        
        
        
        <li class="nav-item first">
                                                                    
        <a href="/" class="nav-link">
                
                Home
    
    
    </a>
                    </li>
    
                
    
        
        
        
        
        
        <li class="nav-item dropdown">
                                    <a href="#" class="dropdown-toggle nav-link" data-bs-toggle="dropdown">
                
                Operations
    
    
        <b class="caret"></b>
    </a>
                                        <div class="dropdown-menu">
                    
                                
                                <a href="/flights" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-plane fa-fw"></i>
            
                Flights
    
    
    </a>

    

                        
                                
                                <a href="/routes" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-calendar fa-fw"></i>
            
                Routes
    
    
    </a>

    

                        
                                
                                <a href="/tours" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-trophy fa-fw"></i>
            
                Tours
    
    
    </a>

    

                        
                                
                                <a href="/fleet/types" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-list fa-fw"></i>
            
                Fleet
    
    
    </a>

    

                        
                                
                                <a href="/hubs" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-building fa-fw"></i>
            
                Hubs
    
    
    </a>

    

                        
                                
                                <a href="/pilots" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-users fa-fw"></i>
            
                Pilots
    
    
    </a>

    

                        
                                
                                <a href="/airlines" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-tag fa-fw"></i>
            
                Airlines
    
    
    </a>

    

                        
                <div class="dropdown-divider"></div>

    

                        
                                
                                <a href="/routes/historical" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-landmark fa-fw"></i>
            
                Historical routes
    
    
    </a>

    

                        
                                
                                <a href="/fleet/historical/types" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-monument fa-fw"></i>
            
                Historical fleet
    
    
    </a>

    

                        </div>
    
                    </li>
    
                
    
        
        
        
        
        
        <li class="nav-item dropdown">
                                    <a href="#" class="dropdown-toggle nav-link" data-bs-toggle="dropdown">
                
                Company
    
    
        <b class="caret"></b>
    </a>
                                        <div class="dropdown-menu">
                    
                                
                                <a href="/company/news" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-newspaper fa-fw"></i>
            
                News
    
    
    </a>

    

                        
                                
                                <a href="/company/pilot-handbook" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-book fa-fw"></i>
            
                Pilot Handbook
    
    
    </a>

    

                        
                                
                                <a href="/company/events" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-calendar fa-fw"></i>
            
                Events
    
    
    </a>

    

                        
                                
                                <a href="https://discord.gg/EAKR7Qe" target="_blank" class="dropdown-item" dropdown="dropdown">
                                    <i class="fab fa-discord fa-fw"></i>
            
                Join Discord
    
    
    </a>

    

                        
                <div class="dropdown-divider"></div>

    

                        
                                
                                <a href="/company/statistics" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-signal fa-fw"></i>
            
                Statistics
    
    
    </a>

    

                        
                                
                                <a href="/company/staff" class="dropdown-item" dropdown="dropdown">
                                    <i class="far fa-user-alt fa-fw"></i>
            
                Staff
    
    
    </a>

    

                        
                                
                                <a href="/company/partners" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-street-view fa-fw"></i>
            
                Partners
    
    
    </a>

    

                        
                <div class="dropdown-divider"></div>

    

                        
                                
                                <a href="/donate" class="dropdown-item" dropdown="dropdown">
                                    <i class="far fa-hands-helping fa-fw"></i>
            
                Donate
    
    
    </a>

    

                        </div>
    
                    </li>
    
                
    
        
        
        
        
        
        <li class="nav-item">
                                                                    
        <a href="/flights/live" class="nav-link">
                
                Live Flights
    
    
    </a>
                    </li>
    
                
    
        
        
        
        
        
        <li class="nav-item dropdown">
                                    <a href="#" class="dropdown-toggle nav-link" data-bs-toggle="dropdown">
                
                Pilot Actions
    
    
        <b class="caret"></b>
    </a>
                                        <div class="dropdown-menu">
                    
                                
                                <a href="/flights/briefing" class="dropdown-item" dropdown="dropdown">
                                    <i class="fas fa-briefcase fa-fw"></i>
            
                Flight Briefing
    
    
    </a>

    

                        </div>
    
                    </li>
    
                
    
        
        
        
        
        
        <li class="nav-item last">
                                                                    
        <a href="/support/tickets" class="nav-link">
                
                Support
    
    
    </a>
                    </li>
    

        </ul>
    

                                                        
        
                            
        <ul class="navbar-nav ms-auto">                
    
        
        
        
        
        
        <li class="nav-item first">
                                                                    
        <a href="/support/tickets" class="nav-link">
                
                <i class="fas fa-question" aria-hidden="true"></i><span class="visually-hidden">Support</span>
    
    
    </a>
                    </li>
    
                
    
        
        
        
        
        
        <li class="user user-menu nav-item active last dropdown" dropdownAlignment="right">
                                    <a href="#" class="dropdown-toggle nav-link" data-bs-toggle="dropdown">
                
                <img src="https://www.gravatar.com/avatar/e235dba02284acb816cd6bbc3663d911?d=mp&s=64" class="user-image" aria-hidden="true"><span class="hidden-xs">Pranav</span>
    
    
        <b class="caret"></b>
    </a>
                                        <div class="dropdown-menu dropdown-menu-right">
                    
                                
                                <a href="/pilots/01kgx01q10sj9jd8fcry3k25f3" class="dropdown-item" dropdown="dropdown">
                
                My Profile
    
    
    </a>

    

                        
                                
                                <a href="/pilot/settings/profile" class="dropdown-item" dropdown="dropdown">
                
                My Settings
    
    
    </a>

    

                        
                                
                                                            <a href="/pilot/logbook" class="dropdown-item active" dropdown="dropdown">
                
                My Logbook
    
    
    </a>

    

                        
                                
                                <a href="/logout" class="dropdown-item" dropdown="dropdown">
                
                Sign Out
    
    
    </a>

    

                        </div>
    
                    </li>
    

        </ul>
    
                                    </div>
            </div>
        </nav>

                    <div class="container-fluid content-wrapper" id="main-content-wrapper">
                    <section class="content-header">
        <h1>
            My Logbook
        </h1>
        <nav aria-label="breadcrumb">
    <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="/">Home</a></li>
                <li class="breadcrumb-item active" aria-current="page">My Logbook</li>
    </ol>
</nav>    </section>

                <section class="content">
                        



                        <div class="card content-card">
        <div class="card-body">
            <span class="float-end">Total reports: 30</span>
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th><a class="desc" href="/pilot/logbook?sort=report.createdAt&amp;direction=asc&amp;page=1" title="Time">
    <span class="float-right">
                                    <i class="fa fa-sort-up"></i>
                        </span>Time</a>
</th>
                            <th><a class="desc" href="/pilot/logbook?sort=report.createdAt&amp;direction=asc&amp;page=1" title="Date">
    <span class="float-right">
                                    <i class="fa fa-sort-up"></i>
                        </span>Date</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=formattedFlightNumber&amp;direction=desc&amp;page=1" title="Flight Number">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Flight Number</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=aircraft.tailNumber&amp;direction=desc&amp;page=1" title="Aircraft">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Aircraft</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=departure.icao&amp;direction=desc&amp;page=1" title="Departure">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Departure</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=arrival.icao&amp;direction=desc&amp;page=1" title="Arrival">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Arrival</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=flight.flightTime&amp;direction=desc&amp;page=1" title="Duration">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Duration</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=flight.landingRate&amp;direction=desc&amp;page=1" title="Landing Rate">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Landing Rate</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=score&amp;direction=desc&amp;page=1" title="Score">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Score</a>
</th>
                            <th><a class="sortable" href="/pilot/logbook?sort=flight.pilotPoints&amp;direction=desc&amp;page=1" title="Pilot Points">
    <span class="float-right">
                    <i class="fa fa-sort"></i>
            </span>Pilot Points</a>
</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="22 May 2026 19:46">
                                        24 minutes ago
                                     </span>
                                </td>
                                <td>
                                    22-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zj07gas0y23fygr5jay1" data-bs-toggle="tooltip" title="Delta Air Lines 2416">DAL2416</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N368NW">
                                        N368NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/CYUL"
                                       data-bs-toggle="tooltip" title="Montreal / Pierre Elliott Trudeau International Airport">
                                        YUL/CYUL
                                    </a>
                                                                            <span class="float-end fi fi-ca"
                                              data-bs-toggle="tooltip"
                                              title="Canada"></span>
                                                                    </td>
                                <td>
                                                                            2:14
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -253
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        763
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01ks8kkd3gxg9tk20ng09w6wdg" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="22 May 2026 02:28">
                                        17 hours ago
                                     </span>
                                </td>
                                <td>
                                    22-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tkewe4cj2jqraxf8r15nn" data-bs-toggle="tooltip" title="China Airlines 5313">CAL5313</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/B-18776">
                                        B-18776
                                    </a>

                                    <a href="/fleet/models/china-airlines-boeing-777-f" class="badge bg-secondary text-bg-secondary float-end">
                                        Boeing 777-F
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/RJGG"
                                       data-bs-toggle="tooltip" title="Chubu Centrair International Airport">
                                        NGO/RJGG
                                    </a>
                                                                            <span class="float-end fi fi-jp"
                                              data-bs-toggle="tooltip"
                                              title="Japan"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/RCTP"
                                       data-bs-toggle="tooltip" title="Taiwan Taoyuan International Airport">
                                        TPE/RCTP
                                    </a>
                                                                            <span class="float-end fi fi-tw"
                                              data-bs-toggle="tooltip"
                                              title="Taiwan, Province of China"></span>
                                                                    </td>
                                <td>
                                                                            2:28
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -148
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        861
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01ks6r5t3yamyqygn9dp0gsxby" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="21 May 2026 22:52">
                                        21 hours ago
                                     </span>
                                </td>
                                <td>
                                    21-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv3he196qc1fcsytc3y45ft" data-bs-toggle="tooltip" title="China Eastern 291">CES291</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/B-1033">
                                        B-1033
                                    </a>

                                    <a href="/fleet/models/china-eastern-airbus-a320-251n" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-251N
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/ZSPD"
                                       data-bs-toggle="tooltip" title="Shanghai Pudong International Airport">
                                        PVG/ZSPD
                                    </a>
                                                                            <span class="float-end fi fi-cn"
                                              data-bs-toggle="tooltip"
                                              title="China"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/RJGG"
                                       data-bs-toggle="tooltip" title="Chubu Centrair International Airport">
                                        NGO/RJGG
                                    </a>
                                                                            <span class="float-end fi fi-jp"
                                              data-bs-toggle="tooltip"
                                              title="Japan"></span>
                                                                    </td>
                                <td>
                                                                            1:52
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -294
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        651
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01ks6bv6ke0n8ha2nzsmd9j1sz" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="21 May 2026 16:50">
                                        1 day ago
                                     </span>
                                </td>
                                <td>
                                    21-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01kn6n9tvx0xvy69s1cahpedgs" data-bs-toggle="tooltip" title="Transavia France 4758">TVF4758</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-HXSF">
                                        F-HXSF
                                    </a>

                                    <a href="/fleet/models/transavia-france-airbus-a320-252n" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-252N
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LFPO"
                                       data-bs-toggle="tooltip" title="Paris-Orly Airport">
                                        ORY/LFPO
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LEBL"
                                       data-bs-toggle="tooltip" title="Josep Tarradellas Barcelona–El Prat Airport">
                                        BCN/LEBL
                                    </a>
                                                                            <span class="float-end fi fi-es"
                                              data-bs-toggle="tooltip"
                                              title="Spain"></span>
                                                                    </td>
                                <td>
                                                                            1:12
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -230
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        100%
                                    </td>
                                                                                                    <td>
                                        521
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01ks5q3gaqx0kgpqagztjwjcpd" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="20 May 2026 23:05">
                                        1 day ago
                                     </span>
                                </td>
                                <td>
                                    20-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zgb75w5t9pfatbrrf8p4" data-bs-toggle="tooltip" title="Delta Air Lines 1323">DAL1323</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N310DN">
                                        N310DN
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-211-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-211(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KMIA"
                                       data-bs-toggle="tooltip" title="Miami International Airport">
                                        MIA/KMIA
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:28
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -106
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        1,234
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01ks3t681dfhseyn6q2nt60xtm" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="17 May 2026 02:21">
                                        5 days ago
                                     </span>
                                </td>
                                <td>
                                    17-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tsaahaftt67symw49wnf0" data-bs-toggle="tooltip" title="Etihad Airways 498">ETD498</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/A6-APC">
                                        A6-APC
                                    </a>

                                    <a href="/fleet/models/etihad-airbus-a380-861" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A380-861
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/OMAA"
                                       data-bs-toggle="tooltip" title="Abu Dhabi International Airport">
                                        AUH/OMAA
                                    </a>
                                                                            <span class="float-end fi fi-ae"
                                              data-bs-toggle="tooltip"
                                              title="United Arab Emirates"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/WSSS"
                                       data-bs-toggle="tooltip" title="Singapore Changi Airport">
                                        SIN/WSSS
                                    </a>
                                                                            <span class="float-end fi fi-sg"
                                              data-bs-toggle="tooltip"
                                              title="Singapore"></span>
                                                                    </td>
                                <td>
                                                                            7:00
                                                                    </td>
                                <td>
                                                                            <span class="text-warning">
                                        -363
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        100%
                                    </td>
                                                                                                    <td>
                                        1,884
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01krsvttqypd4221es9yp9jkkw" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="16 May 2026 00:00">
                                        6 days ago
                                     </span>
                                </td>
                                <td>
                                    16-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01d85tnyv0rv3h5qfqhntd7w20" data-bs-toggle="tooltip" title="Etihad Airways 297">ETD297</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/A6-EIA">
                                        A6-EIA
                                    </a>

                                    <a href="/fleet/models/etihad-airbus-a320-232-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-232(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/OMAA"
                                       data-bs-toggle="tooltip" title="Abu Dhabi International Airport">
                                        AUH/OMAA
                                    </a>
                                                                            <span class="float-end fi fi-ae"
                                              data-bs-toggle="tooltip"
                                              title="United Arab Emirates"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/UBBB"
                                       data-bs-toggle="tooltip" title="Heydar Aliyev International Airport">
                                        GYD/UBBB
                                    </a>
                                                                            <span class="float-end fi fi-az"
                                              data-bs-toggle="tooltip"
                                              title="Azerbaijan"></span>
                                                                    </td>
                                <td>
                                                                            2:39
                                                                    </td>
                                <td>
                                                                            <span class="text-danger">
                                        -477
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        730
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01krq1bsvqpvqt2a98h8kfnp6b" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="8 May 2026 03:36">
                                        14 days ago
                                     </span>
                                </td>
                                <td>
                                    08-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01kq7mgp7je2vp7csxgx0g7c81" data-bs-toggle="tooltip" title="Delta Air Lines 2479">DAL2479</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N384DN">
                                        N384DN
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-211-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-211(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KMIA"
                                       data-bs-toggle="tooltip" title="Miami International Airport">
                                        MIA/KMIA
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:29
                                                                    </td>
                                <td>
                                                                            <span class="text-info">
                                        -23
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        482
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kr2thmvghczqcg9zsmp6shca" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="2 May 2026 04:39">
                                        20 days ago
                                     </span>
                                </td>
                                <td>
                                    02-05-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4ts9yzdmbyp4ej7c8tvc5v" data-bs-toggle="tooltip" title="Etihad Airways 643">ETD643</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/A6-EIH">
                                        A6-EIH
                                    </a>

                                    <a href="/fleet/models/etihad-airbus-a320-232-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-232(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/OMAA"
                                       data-bs-toggle="tooltip" title="Abu Dhabi International Airport">
                                        AUH/OMAA
                                    </a>
                                                                            <span class="float-end fi fi-ae"
                                              data-bs-toggle="tooltip"
                                              title="United Arab Emirates"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/OBBI"
                                       data-bs-toggle="tooltip" title="Bahrain International Airport">
                                        BAH/OBBI
                                    </a>
                                                                            <span class="float-end fi fi-bh"
                                              data-bs-toggle="tooltip"
                                              title="Bahrain"></span>
                                                                    </td>
                                <td>
                                                                            0:57
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -288
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        427
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kqkfrbyd8r521h8y6bdhp9tq" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="30 Apr 2026 03:37">
                                        22 days ago
                                     </span>
                                </td>
                                <td>
                                    30-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tffe5me3xnx63w9h2sek6" data-bs-toggle="tooltip" title="Air France 1401">AFR1401</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-HEPJ">
                                        F-HEPJ
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LEMD"
                                       data-bs-toggle="tooltip" title="Adolfo Suárez Madrid–Barajas Airport">
                                        MAD/LEMD
                                    </a>
                                                                            <span class="float-end fi fi-es"
                                              data-bs-toggle="tooltip"
                                              title="Spain"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                                                            1:33
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -163
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        1,276
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kqe7d23rx2jt5n85txszdc06" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="29 Apr 2026 22:14">
                                        22 days ago
                                     </span>
                                </td>
                                <td>
                                    29-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01kj62931fhpd3dtx3azjztr94" data-bs-toggle="tooltip" title="Air France 1000">AFR1000</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-HBNG">
                                        F-HBNG
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LEMD"
                                       data-bs-toggle="tooltip" title="Adolfo Suárez Madrid–Barajas Airport">
                                        MAD/LEMD
                                    </a>
                                                                            <span class="float-end fi fi-es"
                                              data-bs-toggle="tooltip"
                                              title="Spain"></span>
                                                                    </td>
                                <td>
                                                                            1:40
                                                                    </td>
                                <td>
                                                                            <span class="text-info">
                                        -94
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        667
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kqdmxw7de1z5pm9bs18cbb15" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="29 Apr 2026 03:09">
                                        23 days ago
                                     </span>
                                </td>
                                <td>
                                    29-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tff56v74p5n1404pywy0j" data-bs-toggle="tooltip" title="Air France 7300">AFR7300</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-GKXO">
                                        F-GKXO
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LFMN"
                                       data-bs-toggle="tooltip" title="Nice-Côte d&#039;Azur Airport">
                                        NCE/LFMN
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                                                            1:13
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -234
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        523
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kqbkcc4cfdkchmtrkw149aey" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="10 Apr 2026 04:10">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    10-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tff9r88rsq1gbck8hwvyf" data-bs-toggle="tooltip" title="Air France 1423">AFR1423</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-GKXP">
                                        F-GKXP
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/EDDM"
                                       data-bs-toggle="tooltip" title="Munich International Airport">
                                        MUC/EDDM
                                    </a>
                                                                            <span class="float-end fi fi-de"
                                              data-bs-toggle="tooltip"
                                              title="Germany"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                                                            1:18
                                                                    </td>
                                <td>
                                                                            <span class="text-warning">
                                        -301
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        1,008
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kntsbxzesjmh7th337mn9efw" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="10 Apr 2026 00:56">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    10-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jwpfzget2qvtc9bwaeczcnq7" data-bs-toggle="tooltip" title="Scandinavian Airlines 661">SAS661</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/EI-SIP">
                                        EI-SIP
                                    </a>

                                    <a href="/fleet/models/scandinavian-airlines-airbus-a320-251n" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-251N
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/EKCH"
                                       data-bs-toggle="tooltip" title="Copenhagen Kastrup Airport">
                                        CPH/EKCH
                                    </a>
                                                                            <span class="float-end fi fi-dk"
                                              data-bs-toggle="tooltip"
                                              title="Denmark"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/EDDM"
                                       data-bs-toggle="tooltip" title="Munich International Airport">
                                        MUC/EDDM
                                    </a>
                                                                            <span class="float-end fi fi-de"
                                              data-bs-toggle="tooltip"
                                              title="Germany"></span>
                                                                    </td>
                                <td>
                                                                            1:15
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -260
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        672
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01knte7n01nxr2re3w66fzycpt" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="5 Apr 2026 23:09">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    05-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4w0ygv9e5q61x25604nmm1" data-bs-toggle="tooltip" title="Scandinavian Airlines 506">SAS506</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/EI-SIZ">
                                        EI-SIZ
                                    </a>

                                    <a href="/fleet/models/scandinavian-airlines-airbus-a320-251n" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-251N
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/EGLL"
                                       data-bs-toggle="tooltip" title="London Heathrow Airport">
                                        LHR/EGLL
                                    </a>
                                                                            <span class="float-end fi fi-gb"
                                              data-bs-toggle="tooltip"
                                              title="United Kingdom of Great Britain and Northern Ireland"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/EKCH"
                                       data-bs-toggle="tooltip" title="Copenhagen Kastrup Airport">
                                        CPH/EKCH
                                    </a>
                                                                            <span class="float-end fi fi-dk"
                                              data-bs-toggle="tooltip"
                                              title="Denmark"></span>
                                                                    </td>
                                <td>
                                                                            1:29
                                                                    </td>
                                <td>
                                                                            <span class="text-info">
                                        -46
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        741
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01knfyhekgz594bmf7a61qbmva" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="5 Apr 2026 20:22">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    05-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tfe0spk9my48dng471f2t" data-bs-toggle="tooltip" title="Air France 1890">AFR1890</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-GKXR">
                                        F-GKXR
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LMML"
                                       data-bs-toggle="tooltip" title="Malta International Airport">
                                        MLA/LMML
                                    </a>
                                                                            <span class="float-end fi fi-mt"
                                              data-bs-toggle="tooltip"
                                              title="Malta"></span>
                                                                    </td>
                                <td>
                                                                            2:23
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -142
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        849
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01knfmz24fxawrg76r4scemncx" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="4 Apr 2026 02:55">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    04-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tff18xbeztn69fk637gn3" data-bs-toggle="tooltip" title="Air France 1241">AFR1241</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-GKXR">
                                        F-GKXR
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/EHAM"
                                       data-bs-toggle="tooltip" title="Amsterdam Airport Schiphol">
                                        AMS/EHAM
                                    </a>
                                                                            <span class="float-end fi fi-nl"
                                              data-bs-toggle="tooltip"
                                              title="Netherlands"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                                                            0:45
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -275
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        768
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01knb6p8me6xz5f9tvy5mnj4ds" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="3 Apr 2026 00:33">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    03-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01jr4tff50hzt5sns7zvxfvt5t" data-bs-toggle="tooltip" title="Air France 1240">AFR1240</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/F-GKXG">
                                        F-GKXG
                                    </a>

                                    <a href="/fleet/models/air-france-airbus-a320-214" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-214
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/LFPG"
                                       data-bs-toggle="tooltip" title="Charles de Gaulle International Airport">
                                        CDG/LFPG
                                    </a>
                                                                            <span class="float-end fi fi-fr"
                                              data-bs-toggle="tooltip"
                                              title="France"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/EHAM"
                                       data-bs-toggle="tooltip" title="Amsterdam Airport Schiphol">
                                        AMS/EHAM
                                    </a>
                                                                            <span class="float-end fi fi-nl"
                                              data-bs-toggle="tooltip"
                                              title="Netherlands"></span>
                                                                    </td>
                                <td>
                                                                            0:50
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -158
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        459
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kn8c57mwxw45zftrhfsaxk8r" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="2 Apr 2026 19:43">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    02-04-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtm01gr30xpmvwk0vshnywr" data-bs-toggle="tooltip" title="Delta Air Lines 2500">DAL2500</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N367DN">
                                        N367DN
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-211-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-211(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KJFK"
                                       data-bs-toggle="tooltip" title="John F Kennedy International Airport">
                                        JFK/KJFK
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KMIA"
                                       data-bs-toggle="tooltip" title="Miami International Airport">
                                        MIA/KMIA
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:27
                                                                    </td>
                                <td>
                                                                            <span class="text-danger">
                                        -541
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        649
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kn7vhqx7qnngt02dx9rph07z" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="30 Mar 2026 23:02">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    30-03-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zg1xgky2e64wkbm34fmr" data-bs-toggle="tooltip" title="Delta Air Lines 2380">DAL2380</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N367DN">
                                        N367DN
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-211-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-211(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KJFK"
                                       data-bs-toggle="tooltip" title="John F Kennedy International Airport">
                                        JFK/KJFK
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:50
                                                                    </td>
                                <td>
                                                                            <span class="text-danger">
                                        -579
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        284
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kn0fqj1xgtmh2g472c3a4h50" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="28 Mar 2026 21:06">
                                        1 month ago
                                     </span>
                                </td>
                                <td>
                                    28-03-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtm02jywq81j6mzb2n4m5zb" data-bs-toggle="tooltip" title="Delta Air Lines 322">DAL322</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N385DZ">
                                        N385DZ
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-211-wl" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-211(WL)
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KBOS"
                                       data-bs-toggle="tooltip" title="General Edward Lawrence Logan International Airport">
                                        BOS/KBOS
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:24
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -284
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        946
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kmv498w2kwff70eb9yzx90wv" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="14 Mar 2026 22:19">
                                        2 months ago
                                     </span>
                                </td>
                                <td>
                                    14-03-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtm01sdtc2n7ebjcfambf1x" data-bs-toggle="tooltip" title="Delta Air Lines 1901">DAL1901</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N576DN">
                                        N576DN
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-271nx" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-271NX
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KMCO"
                                       data-bs-toggle="tooltip" title="Orlando International Airport">
                                        MCO/KMCO
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KBOS"
                                       data-bs-toggle="tooltip" title="General Edward Lawrence Logan International Airport">
                                        BOS/KBOS
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:24
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -252
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        972
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kkq6xshn2wp4ys825vskqkff" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="19 Feb 2026 20:42">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    19-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtkzyqswvhpa3v0cftp1kf3" data-bs-toggle="tooltip" title="Delta Air Lines 1059">DAL1059</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N502DX">
                                        N502DX
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a321-271nx" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A321-271NX
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KDTW"
                                       data-bs-toggle="tooltip" title="Detroit Metropolitan Wayne County Airport">
                                        DTW/KDTW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KMCO"
                                       data-bs-toggle="tooltip" title="Orlando International Airport">
                                        MCO/KMCO
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:07
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -170
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        610
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01khvt6z6yc57nyb2fr961qapw" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="19 Feb 2026 05:36">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    19-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtkzyqv7hbeth5c8wz6mk24" data-bs-toggle="tooltip" title="Delta Air Lines 2990">DAL2990</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KMSY"
                                       data-bs-toggle="tooltip" title="Louis Armstrong New Orleans International Airport">
                                        MSY/KMSY
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KDTW"
                                       data-bs-toggle="tooltip" title="Detroit Metropolitan Wayne County Airport">
                                        DTW/KDTW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:53
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -284
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        99%
                                    </td>
                                                                                                    <td>
                                        511
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kht6bwchf37m54hyc1vaq2bq" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="13 Feb 2026 04:10">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    13-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zjfs8nqt67rq973t06j9" data-bs-toggle="tooltip" title="Delta Air Lines 1387">DAL1387</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KJFK"
                                       data-bs-toggle="tooltip" title="John F Kennedy International Airport">
                                        JFK/KJFK
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KMSY"
                                       data-bs-toggle="tooltip" title="Louis Armstrong New Orleans International Airport">
                                        MSY/KMSY
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:56
                                                                    </td>
                                <td>
                                                                            <span class="text-warning">
                                        -313
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        545
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01khak3t7khmtdca2agrkf9gec" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="12 Feb 2026 17:16">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    12-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01kbtkzymcwwcjsq738x08xghj" data-bs-toggle="tooltip" title="Delta Air Lines 9966">DAL9966</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KDTW"
                                       data-bs-toggle="tooltip" title="Detroit Metropolitan Wayne County Airport">
                                        DTW/KDTW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KJFK"
                                       data-bs-toggle="tooltip" title="John F Kennedy International Airport">
                                        JFK/KJFK
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:13
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -262
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        395
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kh9dnq4zhcj17jgxaxm588d1" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="11 Feb 2026 01:53">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    11-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4z9m16nm90xf5ze92gh7w" data-bs-toggle="tooltip" title="Delta Air Lines 2746">DAL2746</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KDFW"
                                       data-bs-toggle="tooltip" title="Dallas Fort Worth International Airport">
                                        DFW/KDFW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KDTW"
                                       data-bs-toggle="tooltip" title="Detroit Metropolitan Wayne County Airport">
                                        DTW/KDTW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:59
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -221
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        374
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kh56f17t9w1esznw2rqe0k3w" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="9 Feb 2026 19:10">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    09-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zhfpk0pvkk6njpxrasv9" data-bs-toggle="tooltip" title="Delta Air Lines 374">DAL374</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KDFW"
                                       data-bs-toggle="tooltip" title="Dallas Fort Worth International Airport">
                                        DFW/KDFW
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            2:03
                                                                    </td>
                                <td>
                                                                            <span class="text-info">
                                        -10
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-primary">
                                        95%
                                    </td>
                                                                                                    <td>
                                        222
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kh1x0fjpfgj4yhx125r66ac4" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="9 Feb 2026 00:37">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    09-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4zf210w1437k7e9ntdw5z" data-bs-toggle="tooltip" title="Delta Air Lines 1491">DAL1491</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N378NW">
                                        N378NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KAUS"
                                       data-bs-toggle="tooltip" title="Austin Bergstrom International Airport">
                                        AUS/KAUS
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            1:40
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -248
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        252
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kgzxat10pgtfsf8xgq437k0d" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                                    <tr>
                                <td>
                                     <span data-bs-toggle="tooltip"
                                           title="8 Feb 2026 18:55">
                                        3 months ago
                                     </span>
                                </td>
                                <td>
                                    08-02-2026
                                </td>
                                <td>
                                     <a href="/routes/01jcv4z9s8e2ahqjkky526bp9m" data-bs-toggle="tooltip" title="Delta Air Lines 1693">DAL1693</a>
                                </td>
                                <td>
                                    <a href="/fleet/aircraft/N342NW">
                                        N342NW
                                    </a>

                                    <a href="/fleet/models/delta-air-lines-airbus-a320-212" class="badge bg-secondary text-bg-secondary float-end">
                                        Airbus A320-212
                                    </a>
                                </td>
                                <td>
                                    <a href="/airports/KATL"
                                       data-bs-toggle="tooltip" title="Hartsfield-Jackson Atlanta International Airport">
                                        ATL/KATL
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                    <a href="/airports/KBNA"
                                       data-bs-toggle="tooltip" title="Nashville International Airport">
                                        BNA/KBNA
                                    </a>
                                                                            <span class="float-end fi fi-us"
                                              data-bs-toggle="tooltip"
                                              title="United States of America"></span>
                                                                    </td>
                                <td>
                                                                            0:44
                                                                    </td>
                                <td>
                                                                            <span class="text-success">
                                        -270
                                    </span>
                                        ft/min
                                                                    </td>
                                                                                                        <td class="text-success">
                                        100%
                                    </td>
                                                                                                    <td>
                                        153
                                    </td>
                                                                <td>
                                                                                                                        <span class="badge text-bg-success p-2">Approved</span>
                                                                                                                                                    </td>
                                <td>
                                    <a href="/flights/01kgz9qe63a59d5z7x7jtxvh4x" class="p-2 badge text-bg-secondary" data-bs-toggle="tooltip" data-placement="right" title="This flight analysis is private">Flight Analysis</a>
                                </td>
                            </tr>
                                            </tbody>
                </table>
            </div>
            
        </div>
    </div>

                </section>
            </div>
        
                    <footer class="main-footer">
                <div class="container">
                    <strong>Copyright &copy; 2016-2026 <a href="https://skyteamvirtual.org/">SkyTeam Virtual</a>.</strong> All rights reserved.
                    <span class="float-end">
                        <a href="/privacy-policy">Privacy Policy</a>
                    </span>
                                            <span class="text-muted">
                            SkyTeam Virtual is in no way affiliated with SkyTeam, its member airlines, their subsidiaries, or any other airlines listed on this website. The usage of logos and aircraft liveries on this website is not approved by the respective airlines.

                        </span>
                                    </div>
            </footer>
            </div>

            
    <div id="vas-config" data-config="&#x7B;&quot;tenant&quot;&#x3A;&quot;skyteamvirtual&quot;,&quot;va_name&quot;&#x3A;&quot;SkyTeam&#x20;Virtual&quot;,&quot;style&quot;&#x3A;&quot;zesiro&quot;&#x7D;"></div>

    <script crossorigin type="module" src="/vite-assets/assets/app-BeCXrmlE.js" integrity="sha384-Ds06HN6iZU2F0+gbxveTIzSrGgEylGwDbvVt431xYIJqSrljm4xx1DumLRW5IJ9M"></script>
</body>
</html>
"""

def duration_to_minutes(duration_str):
    """Converts a duration string formatted as H:MM or HH:MM into total minutes."""
    try:
        parts = duration_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        return (hours * 60) + minutes
    except (ValueError, IndexError):
        return 0

def parse_to_volanta_template(html_data):
    soup = BeautifulSoup(html_data, 'html.parser')
    table_rows = soup.select("table.table tbody tr")
    
    flights_list = []
    total_points = 0
    
    for row in table_rows:
        cells = row.find_all('td')
        if len(cells) < 11:
            continue
            
        # Extract fields from specific cell positions
        raw_date = cells[1].get_text(strip=True)
        raw_flight_num = cells[2].get_text(strip=True)
        raw_aircraft = cells[3].get_text(" ", strip=True) 
        raw_dep = cells[4].get_text(strip=True)
        raw_arr = cells[5].get_text(strip=True)
        raw_duration = cells[6].get_text(strip=True)
        raw_points = cells[9].get_text(strip=True)
        
        # Calculate Total Pilot Points (strip commas)
        cleaned_points = raw_points.replace(',', '')
        if cleaned_points.isdigit():
            total_points += int(cleaned_points)
        
        # Reformat Date from DD-MM-YYYY to YYYY-MM-DD
        try:
            date_parts = raw_date.split('-')
            formatted_date = f"{date_parts[2]}-{date_parts[1]}-{date_parts[0]}"
        except IndexError:
            formatted_date = raw_date

        # Clean Airports (isolate raw ICAO codes following structural slashes)
        dep_icao = raw_dep.split('/')[-1] if '/' in raw_dep else raw_dep
        arr_icao = raw_arr.split('/')[-1] if '/' in raw_arr else raw_arr
        
        # Convert duration string to total minutes integer
        duration_in_minutes = duration_to_minutes(raw_duration)

        # Parse Airline, Callsign, and FlightNumber fields from the identifier
        callsign = raw_flight_num
        airline_match = "".join([char for char in raw_flight_num if char.isalpha()])
        number_match = "".join([char for char in raw_flight_num if char.isdigit()])

        # Clean Aircraft fields
        aircraft_parts = raw_aircraft.split()
        registration = aircraft_parts[0] if aircraft_parts else ""
        
        full_model = " ".join(aircraft_parts[1:])
        if "Airbus A320" in full_model:
            aircraft_type = "A320"
        elif "Airbus A321" in full_model:
            aircraft_type = "A321"
        elif "Airbus A380" in full_model:
            aircraft_type = "A380"
        elif "Boeing 777" in full_model:
            aircraft_type = "B77W" if "F" in full_model else "B777"
        else:
            aircraft_type = full_model

        # Strictly fulfill layout order specified by the import template schema
        flights_list.append({
            'Origin': dep_icao,
            'Destination': arr_icao,
            'DepartureTime': formatted_date,
            'Duration': duration_in_minutes, # Now cleanly mapped in integer minutes
            'Airline': airline_match,
            'Callsign': callsign,
            'FlightNumber': number_match,
            'AircraftType': aircraft_type,
            'AircraftRegistration': registration,
            'Route': '',                 
            'ArrivalTime': '',           
            'Distance': '',              
            'Fuel': ''                   
        })
        
    df = pd.DataFrame(flights_list)
    return df, total_points

# Run template generator
volanta_template_df, pilot_points_sum = parse_to_volanta_template(html_content)

# Display matrix block output confirmation map showing minutes
print("Parsed Flight Logbook Mapping Summary:")
print(volanta_template_df[['Origin', 'Destination', 'DepartureTime', 'Duration', 'Callsign', 'AircraftType', 'AircraftRegistration']].to_string(index=False))

print("\n" + "="*40)
print(f"TOTAL PILOT POINTS EARNED: {pilot_points_sum:,}")
print("="*40)

# Save file explicitly to distinct naming scheme to avert permission locking issues
output_filename = 'skyteam_volanta_final_import.csv'
volanta_template_df.to_csv(output_filename, index=False)
print(f"\n[Success] Template headers followed. File compiled to '{output_filename}'")