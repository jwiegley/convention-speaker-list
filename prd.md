# Product Requirements Document (PRD)
## Convention Speaker Queue Management System

### 1. Executive Summary

The Convention Speaker Queue Management System is a web-based application designed to facilitate orderly and equitable participation in convention discussions. The system manages speaker queues, tracks participation demographics, and provides real-time visualization of speaking patterns to promote inclusive dialogue.

### 2. Product Overview

#### 2.1 Vision
Create an interactive web application that streamlines the process of managing speaking order at conventions while promoting diversity and time-conscious participation.

#### 2.2 Goals
- Efficiently manage speaker queues with priority for first-time speakers
- Provide real-time visibility of speaking order to all participants
- Track and visualize demographic participation patterns
- Encourage time-conscious speaking through gamified visual feedback
- Maintain comprehensive records for post-event analysis

#### 2.3 Target Users
- **Administrators**: Convention moderators who manage the speaker queue
- **Spectators**: Convention delegates and audience members viewing the queue

### 3. User Personas

#### 3.1 Administrator
- **Role**: Convention moderator or technical operator
- **Needs**: Quick data entry, queue management, timing control, demographic tracking
- **Access**: Password-protected administrator interface

#### 3.2 Spectator
- **Role**: Convention delegates, participants, and audience members
- **Needs**: Clear visibility of speaking order, current speaker identification
- **Access**: Password-protected spectator interface

### 4. Functional Requirements

#### 4.1 Delegate Management

##### 4.1.1 Delegate Attributes
Each delegate must have:
- **Number**: Unique identifier matching their physical card
- **Name**: Full name of the delegate
- **Location**: Where they're from
- **Gender**: Male/Female/Other
- **Age Bracket**: Decade-based grouping (20s, 30s, 40s, etc.)
- **Race Category**: White/Persian or Non-White/Non-Persian

##### 4.1.2 Delegate Database
- Store all delegate information persistently
- Allow CRUD operations on delegate records
- Support bulk import/export of delegate data

#### 4.2 Queue Management

##### 4.2.1 Queue Structure
- **On-Deck Positions** (Fixed once assigned):
  1. Current Speaker (Position 1)
  2. Next Speaker (Position 2)
  3. Following Speaker (Position 3)
- **General Queue**: All other waiting speakers

##### 4.2.2 Queue Priority Rules
- First-time speakers automatically jump to the top of the general queue
- First-time speakers do NOT preempt on-deck positions
- Within same priority level, maintain FIFO order

##### 4.2.3 Queue Operations
- Add speaker by entering delegate number
- Advance queue (move next speaker to current position)
- Remove speaker from queue
- Manual reordering capability for administrators

#### 4.3 Speaking Status Tracking

##### 4.3.1 Speaking History
- Track whether delegate has spoken before
- Differentiate between tracked and untracked sessions
- Maintain count of speaking instances

##### 4.3.2 Session Types
- **Tracked Sessions**: Count towards "has spoken" status
- **Untracked Sessions**: Do not affect "has spoken" status but still record timing

#### 4.4 Time Management

##### 4.4.1 Speaking Timer
- 3-minute default allocation per speaker
- Automatic start when speaker reaches position 1
- Manual pause/resume capability
- Automatic stop when next speaker advances

##### 4.4.2 Time Tracking
- Individual speaking duration per instance
- Cumulative speaking time per delegate
- Session total speaking time

#### 4.5 User Interfaces

##### 4.5.1 Spectator View

**Display Elements:**
- **Current Speaker** (Position 1):
  - Large font, bright color
  - Shows number and name
- **Next Speaker** (Position 2):
  - Medium font, less bright color
  - Shows number and name
- **Following Speaker** (Position 3):
  - Smaller font, dimmed color
  - Shows number and name
- **Queue Display**:
  - First 20 queue positions: Show number and name
  - Positions 21-50: Show only numbers in card-like visual representation
  - Grid layout for clear visibility
  - No scrolling required
- **Visual Indicators**:
  - Yellow/bright cards: First-time speakers
  - Blue/dark cards: Previous speakers

**Optional Elements:**
- Demographic balance indicators (toggleable)
- Garden visualization

##### 4.5.2 Administrator View

**Core Functions:**
- **Delegate Management Tab**:
  - Full CRUD operations on delegate records
  - Bulk operations support
  - Import/export functionality

- **Queue Management Tab**:
  - Plain list view of full queue
  - Number entry field for adding speakers
  - Queue advancement button
  - Timer controls (start/pause/reset)
  - Session tracking toggle

**Display Elements:**
- Complete queue list with numbers and names
- Current timer display
- Demographic balance indicators (always visible)
- Garden visualization
- Quick-action buttons for common operations

#### 4.6 Visualizations

##### 4.6.1 Demographic Balance Indicators
Three vertical lever-style indicators showing:

1. **Gender Balance**:
   - Top: More female speakers
   - Bottom: More male speakers

2. **Age Balance**:
   - Top: More younger speakers
   - Bottom: More older speakers

3. **Race Balance**:
   - Top: More non-white/non-Persian speakers
   - Bottom: More white/Persian speakers

##### 4.6.2 Garden Visualization
- **Purpose**: Encourage time-conscious speaking
- **States**: 33 images transitioning from desert to lush garden
- **Starting State**: Lush garden
- **Progression Logic**:
  - Moves toward garden when speakers finish early
  - Moves toward desert when speakers exceed time
  - Change proportional to time difference from 3-minute allocation

#### 4.7 Statistics and Analytics

##### 4.7.1 Real-time Statistics
- Current session duration
- Number of unique speakers
- Average speaking time
- Queue length

##### 4.7.2 Comprehensive Analytics (Administrator Only)
- **Participation Metrics**:
  - Total participation percentage
  - Participation by gender
  - Participation by age bracket
  - Participation by race category
- **Time Metrics**:
  - Average speaking duration per person
  - Total speaking time
  - Time distribution analysis
- **Session Metrics**:
  - Number of tracked vs untracked sessions
  - Speaking frequency distribution
- **Export Capabilities**:
  - CSV export of all data
  - PDF reports with visualizations

### 5. Non-Functional Requirements

#### 5.1 Performance
- Support minimum 200 concurrent users
- Queue updates visible within 1 second
- No page refreshes required for real-time updates

#### 5.2 Usability
- Responsive design for various screen sizes
- High contrast mode for visibility
- Keyboard shortcuts for common admin actions
- Mobile-friendly admin interface for backup access

#### 5.3 Security
- Separate passwords for admin and spectator access
- Session timeout after inactivity
- Audit log of all admin actions
- Encrypted storage of sensitive demographic data

#### 5.4 Accessibility
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation support
- Configurable font sizes

#### 5.5 Reliability
- Auto-save queue state every 30 seconds
- Local storage backup for network interruptions
- Data recovery mechanisms
- Offline mode for critical functions

### 6. Technical Architecture

#### 6.1 Technology Stack (Recommended)
- **Frontend**: React/Vue.js with TypeScript
- **Backend**: Node.js with Express or Python with FastAPI
- **Database**: PostgreSQL for persistent storage
- **Real-time Updates**: WebSockets (Socket.io)
- **Caching**: Redis for session management
- **Deployment**: Docker containers

#### 6.2 Data Model

##### Core Entities
```
Delegate:
- id (UUID)
- number (Integer, unique)
- name (String)
- location (String)
- gender (Enum)
- age_bracket (Enum)
- race_category (Enum)
- has_spoken (Boolean)
- created_at (Timestamp)
- updated_at (Timestamp)

SpeakingInstance:
- id (UUID)
- delegate_id (Foreign Key)
- session_id (Foreign Key)
- start_time (Timestamp)
- end_time (Timestamp)
- duration_seconds (Integer)
- position_in_queue (Integer)
- is_tracked (Boolean)

Session:
- id (UUID)
- name (String)
- start_time (Timestamp)
- end_time (Timestamp)
- is_tracked (Boolean)
- garden_state (Integer 0-32)

Queue:
- id (UUID)
- session_id (Foreign Key)
- delegate_id (Foreign Key)
- position (Integer)
- added_at (Timestamp)
- status (Enum: waiting, on_deck, speaking, completed)
```

### 7. User Stories

#### 7.1 Administrator Stories
1. As an admin, I want to quickly add a speaker to the queue by entering their number
2. As an admin, I want to advance the queue with a single button click
3. As an admin, I want to pause the timer during interruptions
4. As an admin, I want to toggle between tracked and untracked sessions
5. As an admin, I want to export participation statistics after the event

#### 7.2 Spectator Stories
1. As a spectator, I want to clearly see who is currently speaking
2. As a spectator, I want to know my position in the queue
3. As a spectator, I want to identify first-time speakers by visual cues
4. As a spectator, I want to see the diversity balance of speakers

### 8. Acceptance Criteria

#### 8.1 Queue Management
- [ ] System correctly prioritizes first-time speakers
- [ ] On-deck positions remain fixed when new speakers join
- [ ] Queue updates are visible to all users within 1 second

#### 8.2 Time Management
- [ ] Timer automatically starts when speaker advances to position 1
- [ ] Garden visualization updates based on cumulative time performance
- [ ] All timing data is accurately recorded in the database

#### 8.3 Demographics
- [ ] Balance indicators accurately reflect speaking history
- [ ] Statistics page shows correct participation percentages
- [ ] Export includes all demographic breakdowns

### 9. Future Enhancements

#### Phase 2 Considerations
- Mobile app for delegate self-registration
- QR code scanning for queue entry
- Multi-language support
- Integration with conference management systems
- Advanced analytics dashboard
- Automated report generation
- Voice announcement integration
- Delegate profile photos
- Speaking topic categorization
- Sentiment analysis of speaking patterns

### 10. Success Metrics

#### 10.1 Operational Metrics
- Queue processing time reduced by 50%
- Zero missed speakers due to system errors
- 95% uptime during events

#### 10.2 Participation Metrics
- Increase in unique speakers by 30%
- Improved demographic balance (measured by standard deviation)
- Reduction in average speaking time overruns by 40%

#### 10.3 User Satisfaction
- Admin satisfaction score > 4.5/5
- Spectator clarity rating > 4.0/5
- Post-event analytics utilized by > 80% of events

### 11. Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Network connectivity issues | Medium | High | Implement offline mode with sync |
| Browser compatibility | Low | Medium | Test on major browsers, provide fallbacks |
| Data privacy concerns | Medium | High | Implement data anonymization options |
| User adoption resistance | Medium | Medium | Provide training materials and support |
| Performance degradation with large queues | Low | High | Implement pagination and lazy loading |

### 12. Timeline and Milestones

#### Phase 1: MVP (Weeks 1-6)
- Week 1-2: Database design and backend setup
- Week 3-4: Core queue management functionality
- Week 5: User interfaces (admin and spectator)
- Week 6: Testing and bug fixes

#### Phase 2: Visualizations (Weeks 7-8)
- Week 7: Demographic indicators and garden visualization
- Week 8: Statistics page and reporting

#### Phase 3: Polish and Deploy (Weeks 9-10)
- Week 9: Performance optimization and security hardening
- Week 10: Deployment and documentation

### 13. Appendices

#### Appendix A: Garden Image Specifications
- 33 total images (1 desert + 32 transitions)
- Recommended resolution: 1920x1080
- Format: WebP for optimal performance
- Artistic style: Consistent, calming, nature-focused

#### Appendix B: Color Scheme Recommendations
- First-time speakers: #FFD700 (Gold)
- Previous speakers: #4169E1 (Royal Blue)
- Current speaker: #00FF00 (Bright Green)
- Next speaker: #FFA500 (Orange)
- Following speaker: #87CEEB (Sky Blue)

#### Appendix C: Keyboard Shortcuts (Admin)
- Space: Advance queue
- P: Pause/Resume timer
- N: Focus on number entry field
- S: Toggle session tracking
- Ctrl+E: Export current statistics