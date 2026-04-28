---
name: office-lunch-picker
description: Monitor Teams lunch channel, extract meal options, help team pick together, auto-log selections to meal_log.md
---

# Office Lunch Picker

Streamline team lunch decisions by monitoring the Teams channel for lunch options, extracting menu choices, helping the team pick meals, and auto-logging selections.

## When to Use

- Use `/office-lunch-picker` when checking for daily lunch options
- Use when you need to help the team decide on a meal
- Automatically triggered when a Teams lunch channel link is provided

## Workflow

### Step 1: Get Latest Teams Channel Link

Extract or resolve the Teams channel URL. Use Playwright browser to navigate to the channel and capture the current meal options form.

Teams lunch channels typically contain:
- Restaurant options
- Menu items/sandwich choices
- Dietary preferences (vegetarian, non-vegetarian, etc.)
- Required form fields (name, preferences, urgency)

### Step 2: Open in Playwright and Capture Options

1. Launch Playwright browser session
2. Navigate to the Teams channel URL
3. Take a snapshot of the page to identify:
   - Available restaurants
   - Available meal options for each restaurant
   - Form fields required
4. Extract all text content (meal names, descriptions, requirements)

### Step 3: Present Options to Team

Display the extracted options clearly:
- List all restaurants
- Show meal choices per restaurant
- Highlight any special/adventurous options
- Note dietary restrictions if relevant

### Step 4: Facilitate Selection

If a specific team member needs to fill the form:
1. Ask for their preferences (name, dietary needs, urgency)
2. Use Playwright to fill the form fields
3. Submit the form if instructed

Common selections:
- **Name field**: Usually first field
- **Dietary preference**: vegetarian/non-vegetarian toggle or selection
- **Urgency/Status**: "need lunch", "maybe later", etc.
- **Optional notes**: Special requests, allergies, preferences

### Step 5: Auto-Log to meal_log.md

After selection is made, append entry to `d:\docs\office-lunch\meal_log.md`:

```markdown
## Order: YYYY-MM-DD
**Restaurant:** [Name]
**Selection:** [Meal chosen]
**Name:** [Team member]
**Preferences:** [dietary/other]
**Status:** [submitted/pending]
```

Include:
- Date
- Restaurant name
- Meal selection
- Team member name
- Any special notes or preferences

## Configuration & Preferences

**Default Teams Channel (xx's office lunch):**
```
https://teams.microsoft.com/l/channel/19%3A30ef4fe89cf14f44ad150ec46483c2fe%40thread.tacv2/Whats%20for%20Lunch?groupId=a3b483c5-52e2-469d-84c3-a8a0276a2b93&tenantId=568e89c5-4313-44e9-be44-09b7b2fffdd4
```

**User Preferences (xx):**
- **Dietary:** Non-vegetarian
- **Style:** Savory and adventurous
- **Bread preference:** Honey Oat
- **Go-to veggies:** Lettuce, Tomatoes, Corn, Cucumber
- **Sauce style:** Classic/complementary (e.g., Mayonnaise, Sweet Onion)
- **Optimization:** For satisfaction and flavor richness

*Preferences are auto-updated in meal_log.md after each order*

## Tips

- Use default Teams link above for xx's orders (no need to ask)
- If form has unexpected layout, take screenshot and describe what you see
- Non-vegetarian bias: Prioritize meaty, savory, adventurous options unless specified otherwise
- If multiple people ordering together, process one person at a time
- Preserve meal log format — don't break existing entries
- Track and evolve meal preferences based on what works well in practice

## Prerequisites

- Playwright browser access
- Access to Teams channel link (stored in skill config above)
- Write access to `d:\docs\office-lunch\meal_log.md`
